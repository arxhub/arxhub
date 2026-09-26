import {
  constantTimeEqual,
  fromB64Url,
  generateInvitationCode,
  generateInvitationId,
  generatePairingToken,
  isInvitationId,
  normalizeInvitationCode,
} from '@arxhub/crypto'
import { validation } from '@arxhub/errors'
import { pairingClaimed, pairingForbidden, pairingLimit, pairingNotFound, pairingRateLimited, pairingState } from './errors'
import {
  CLAIM_MISSES_PER_MINUTE,
  type ClaimBody,
  type ClaimedInvitation,
  type CreatedInvitation,
  type HostView,
  JOIN_BURST,
  JOIN_RATE_PER_SECOND,
  JOIN_REQUESTS_PER_INVITATION,
  type JoinerView,
  MAX_CIPHERTEXT_BYTES,
  MAX_DEVICE_NAME_LENGTH,
  MAX_OPEN_INVITATIONS,
  PAIRING_TTL_MS,
  type PairingState,
} from './wire'

interface Limiter {
  tokens: number
  updatedAt: number
  used: number
}

// Key material is nulled the moment an invitation ends; the record stays only as a tombstone so the
// other side's next poll learns the outcome instead of a bare 404.
interface Invitation {
  id: string
  code: string
  state: PairingState
  expiresAt: number
  hostKey: string | null
  joiner: { key: string | null; commit: string | null; deviceName: string; token: string } | null
  hostNonce: string | null
  joinerNonce: string | null
  ciphertext: string | null
  limiter: Limiter
}

const TERMINAL: ReadonlySet<PairingState> = new Set(['completed', 'cancelled'])
const MINUTE_MS = 60_000

export interface PairingRelayOptions {
  now?: () => number
}

// In memory by design: the server is single-node, an invitation lives five minutes, and a restart only
// costs the invitations that were open at the time — the owner makes a new one.
export class PairingRelay {
  private readonly now: () => number
  private readonly invitations = new Map<string, Invitation>()
  private readonly byCode = new Map<string, string>()
  private misses = { windowStart: 0, count: 0 }

  constructor(options: PairingRelayOptions = {}) {
    this.now = options.now ?? Date.now
  }

  get size(): number {
    return this.invitations.size
  }

  sweep(): void {
    const now = this.now()
    for (const invitation of this.invitations.values()) if (invitation.expiresAt <= now) this.remove(invitation)
  }

  create(hostKey: string): CreatedInvitation {
    decodeExact(hostKey, 32)
    this.sweep()
    let open = 0
    for (const invitation of this.invitations.values()) if (!TERMINAL.has(invitation.state)) open++
    if (open >= MAX_OPEN_INVITATIONS) throw pairingLimit()

    const now = this.now()
    let code = generateInvitationCode()
    while (this.byCode.has(code)) code = generateInvitationCode()
    const invitation: Invitation = {
      id: generateInvitationId(),
      code,
      state: 'open',
      expiresAt: now + PAIRING_TTL_MS,
      hostKey,
      joiner: null,
      hostNonce: null,
      joinerNonce: null,
      ciphertext: null,
      limiter: { tokens: JOIN_BURST, updatedAt: now, used: 0 },
    }
    this.invitations.set(invitation.id, invitation)
    this.byCode.set(code, invitation.id)
    return { id: invitation.id, code, expiresAt: invitation.expiresAt, ttlSeconds: this.ttl(invitation) }
  }

  // ---- host side: authenticated by the vault's own signature, so no limiter ----

  hostView(id: string): HostView {
    const invitation = this.live(id)
    const view: HostView = { state: invitation.state, ttlSeconds: this.ttl(invitation) }
    const joiner = invitation.joiner
    if (joiner?.key != null && joiner.commit != null) view.joiner = { key: joiner.key, commit: joiner.commit, deviceName: joiner.deviceName }
    if (invitation.joinerNonce != null) view.joinerNonce = invitation.joinerNonce
    return view
  }

  hostNonce(id: string, hostNonce: string): void {
    decodeExact(hostNonce, 16)
    const invitation = this.live(id)
    this.requireState(invitation, 'claimed')
    invitation.hostNonce = hostNonce
    invitation.state = 'nonced'
  }

  deliver(id: string, ciphertext: string): void {
    if (fromB64Url(ciphertext).length > MAX_CIPHERTEXT_BYTES) throw validation('Ciphertext too large')
    const invitation = this.live(id)
    this.requireState(invitation, 'revealed')
    invitation.ciphertext = ciphertext
    invitation.state = 'delivered'
  }

  hostCancel(id: string): void {
    this.end(this.live(id), 'cancelled')
  }

  // ---- joiner side: anonymous, so every call spends the invitation's budget before anything else ----

  claim(ref: string, body: ClaimBody): ClaimedInvitation {
    decodeExact(body.joinerKey, 32)
    decodeExact(body.commit, 32)
    const invitation = this.lookup(ref)
    this.spend(invitation)
    if (invitation.state !== 'open' || invitation.hostKey == null) throw pairingClaimed()
    const token = generatePairingToken()
    invitation.joiner = { key: body.joinerKey, commit: body.commit, deviceName: cleanDeviceName(body.deviceName), token }
    invitation.state = 'claimed'
    return { id: invitation.id, hostKey: invitation.hostKey, token, ttlSeconds: this.ttl(invitation) }
  }

  joinerView(id: string, token: string | null): JoinerView {
    const invitation = this.joined(id, token)
    const view: JoinerView = { state: invitation.state, ttlSeconds: this.ttl(invitation) }
    if (invitation.hostNonce != null) view.hostNonce = invitation.hostNonce
    if (invitation.ciphertext != null) view.ciphertext = invitation.ciphertext
    return view
  }

  reveal(id: string, token: string | null, joinerNonce: string): void {
    decodeExact(joinerNonce, 16)
    const invitation = this.joined(id, token)
    this.requireState(invitation, 'nonced')
    invitation.joinerNonce = joinerNonce
    invitation.state = 'revealed'
  }

  ack(id: string, token: string | null): void {
    const invitation = this.joined(id, token)
    this.requireState(invitation, 'delivered')
    this.end(invitation, 'completed')
  }

  joinerCancel(id: string, token: string | null): void {
    this.end(this.joined(id, token), 'cancelled')
  }

  // ---- internals ----

  private ttl(invitation: Invitation): number {
    return Math.max(0, Math.ceil((invitation.expiresAt - this.now()) / 1000))
  }

  private live(id: string): Invitation {
    const invitation = this.invitations.get(id)
    if (invitation == null) throw pairingNotFound()
    if (invitation.expiresAt <= this.now()) {
      this.remove(invitation)
      throw pairingNotFound()
    }
    return invitation
  }

  private lookup(ref: string): Invitation {
    const id = isInvitationId(ref) ? ref : this.byCode.get(normalizeInvitationCode(ref) ?? '')
    const invitation = id == null ? undefined : this.invitations.get(id)
    if (invitation != null && invitation.expiresAt <= this.now()) {
      this.remove(invitation)
      return this.miss()
    }
    if (invitation == null || TERMINAL.has(invitation.state)) return this.miss()
    return invitation
  }

  // Every miss counts, and once the minute's budget is gone every further miss is refused as a rate
  // limit until the window rolls over — a claim that finds its invitation is never held back by it.
  private miss(): never {
    const now = this.now()
    if (now - this.misses.windowStart >= MINUTE_MS) this.misses = { windowStart: now, count: 0 }
    this.misses.count++
    if (this.misses.count > CLAIM_MISSES_PER_MINUTE) {
      throw pairingRateLimited(Math.max(1, Math.ceil((this.misses.windowStart + MINUTE_MS - now) / 1000)), 'Too many attempts — wait a minute.')
    }
    throw pairingNotFound()
  }

  // Order matters: the budget is spent before the token is checked, so guessing tokens costs the same
  // as any other request, and a 403 is never a free probe.
  private joined(id: string, token: string | null): Invitation {
    const invitation = this.live(id)
    this.spend(invitation)
    if (invitation.joiner == null || token == null || !tokenMatches(invitation.joiner.token, token)) throw pairingForbidden()
    return invitation
  }

  private spend(invitation: Invitation): void {
    const now = this.now()
    const limiter = invitation.limiter
    limiter.tokens = Math.min(JOIN_BURST, limiter.tokens + ((now - limiter.updatedAt) / 1000) * JOIN_RATE_PER_SECOND)
    limiter.updatedAt = now
    if (limiter.used >= JOIN_REQUESTS_PER_INVITATION) throw pairingRateLimited(Math.max(1, this.ttl(invitation)))
    if (limiter.tokens < 1) throw pairingRateLimited(Math.max(1, Math.ceil((1 - limiter.tokens) / JOIN_RATE_PER_SECOND)))
    limiter.tokens -= 1
    limiter.used++
  }

  private requireState(invitation: Invitation, state: PairingState): void {
    if (invitation.state !== state) throw pairingState()
  }

  // Ending is idempotent: a device that closes its screen after the other side already finished or
  // cancelled has nothing left to undo.
  private end(invitation: Invitation, state: 'completed' | 'cancelled'): void {
    if (TERMINAL.has(invitation.state)) return
    invitation.state = state
    invitation.hostKey = null
    invitation.hostNonce = null
    invitation.joinerNonce = null
    invitation.ciphertext = null
    if (invitation.joiner != null) invitation.joiner = { key: null, commit: null, deviceName: '', token: invitation.joiner.token }
    this.byCode.delete(invitation.code)
  }

  private remove(invitation: Invitation): void {
    this.invitations.delete(invitation.id)
    if (this.byCode.get(invitation.code) === invitation.id) this.byCode.delete(invitation.code)
  }
}

// The token is the only credential on the anonymous write routes, so it is never compared byte by byte
// with an early exit.
function tokenMatches(expected: string, provided: string): boolean {
  const encoder = new TextEncoder()
  return constantTimeEqual(encoder.encode(expected), encoder.encode(provided))
}

function decodeExact(value: string, bytes: number): void {
  if (fromB64Url(value).length !== bytes) throw validation(`Expected ${bytes} bytes`)
}

// Shown on the owner's first device beside the digits. Not trusted for anything, but it is printed,
// so control and format characters are dropped rather than rendered.
function cleanDeviceName(name: string): string {
  return name
    .replace(/[\p{C}]/gu, '')
    .trim()
    .slice(0, MAX_DEVICE_NAME_LENGTH)
}
