import { apiBaseUrl } from '@arxhub/core'
import {
  constantTimeEqual,
  derivePairingKey,
  derivePairingSas,
  fromB64Url,
  generatePairingKeyPair,
  generatePairingNonce,
  invitationQr,
  isInvitationId,
  type Keyring,
  MutableRequestSigner,
  normalizeInvitationCode,
  openPairingPayload,
  type PairingKeyPair,
  type PairingPayload,
  pairingCommit,
  pairingCommitMatches,
  sealPairingPayload,
  signingMiddleware,
  toB64Url,
} from '@arxhub/crypto'
import { type AppError, isAppError, validation } from '@arxhub/errors'
import { type ConfiguredMiddleware, createTypedHttp, isHttpError } from '@arxhub/http'
import { type Ref, ref, type ShallowRef, shallowRef } from 'vue'
import {
  pairingCancelled,
  pairingCommitMismatch,
  pairingErrorFromBody,
  pairingExpired,
  pairingNotFound,
  pairingRefused,
  pairingSasMismatch,
  pairingState,
  pairingUnreachable,
  retryAfterOf,
} from './errors'
import type { PairingApp } from './pairing-routes'
import { PAIR_TOKEN_HEADER, PAIRING_NAMESPACE } from './wire'

const DEFAULT_POLL_MS = 1000

// The relay's own refusal is rebuilt as the same AppError; a failure with no HTTP status (the network
// dropped one poll) is not an outcome and is returned as null, so the loop simply asks again.
function relayError(error: unknown): AppError | null {
  if (isAppError(error)) return error
  if (typeof error !== 'object' || error == null || !('status' in error)) return null
  const rebuilt = pairingErrorFromBody((error as { json?: unknown }).json)
  if (rebuilt != null) return rebuilt
  if (isHttpError(error, 404)) return pairingNotFound()
  return pairingRefused(String((error as { status: unknown }).status))
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function wipe(keys: PairingKeyPair | null): void {
  keys?.secretKey.fill(0)
}

// Polls `step` until it returns true, the run is aborted, or the relay refuses. A relay rate limit
// waits exactly as long as the relay asked; a dropped connection is retried at the normal cadence.
async function pollUntil(signal: AbortSignal, pollMs: number, step: () => Promise<boolean>): Promise<void> {
  while (true) {
    await pause(pollMs, signal)
    try {
      if (await step()) return
    } catch (error) {
      if (signal.aborted) throw signal.reason
      const refusal = relayError(error)
      if (refusal == null) continue
      // An invitation that vanishes while being followed has expired: it was found a moment ago.
      if (refusal.body.code === 'PairingNotFoundError') throw pairingExpired()
      const retryAfter = retryAfterOf(refusal)
      if (retryAfter != null) {
        await pause(retryAfter * 1000, signal)
        continue
      }
      throw refusal
    }
  }
}

export interface PairingInvitation {
  id: string
  code: string
  qr: string
}

export type PairingHostPhase =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connecting'
  | 'compare'
  | 'sending'
  | 'done'
  | 'expired'
  | 'cancelled'
  | 'failed'

export interface PairingHostOptions {
  server: string
  keyring: Keyring
  // The phrase being handed over. Read from the keystore by the caller after the code is re-entered.
  mnemonic: string
  fetch?: typeof fetch
  pollMs?: number
}

// The first device's half: opens an invitation, answers the joiner's claim with its nonce, checks the
// joiner's reveal against its commit, shows the digits and — only on the owner's word — sends the
// phrase sealed under the key both sides derived.
export class PairingHost {
  readonly phase: Ref<PairingHostPhase> = ref('idle')
  readonly invitation: ShallowRef<PairingInvitation | null> = shallowRef(null)
  readonly sas: Ref<string | null> = ref(null)
  readonly deviceName: Ref<string | null> = ref(null)
  readonly ttlSeconds = ref(0)
  readonly error: ShallowRef<AppError | null> = shallowRef(null)

  private readonly options: PairingHostOptions
  private readonly http: ReturnType<typeof createTypedHttp<PairingApp>>
  private run: AbortController | null = null
  private keys: PairingKeyPair | null = null
  private joiner: { key: Uint8Array; commit: Uint8Array } | null = null
  private hostNonce: Uint8Array | null = null
  private joinerNonce: Uint8Array | null = null

  constructor(options: PairingHostOptions) {
    this.options = options
    const signer = new MutableRequestSigner()
    signer.install(options.keyring)
    this.http = createTypedHttp<PairingApp>({
      baseUrl: apiBaseUrl(options.server, PAIRING_NAMESPACE),
      middlewares: [signingMiddleware(signer)],
      fetch: options.fetch,
    })
  }

  // Opens a fresh invitation (dropping any previous one) and follows it to an outcome. Resolves when
  // the phase settles; the outcome itself is read from `phase` and `error`.
  async start(): Promise<void> {
    await this.cancel()
    const run = new AbortController()
    this.run = run
    this.error.value = null
    this.sas.value = null
    this.deviceName.value = null
    this.phase.value = 'creating'
    try {
      this.keys = generatePairingKeyPair()
      const created = await this.http.post('/invitations', { hostKey: toB64Url(this.keys.publicKey) })
      if (run.signal.aborted) return
      this.invitation.value = { id: created.id, code: created.code, qr: invitationQr(this.options.server, created.id) }
      this.ttlSeconds.value = created.ttlSeconds
      this.phase.value = 'waiting'
      await pollUntil(run.signal, this.options.pollMs ?? DEFAULT_POLL_MS, () => this.step(created.id))
    } catch (error) {
      if (run.signal.aborted) return
      this.settleFailure(relayError(error) ?? pairingUnreachable())
    } finally {
      if (this.run === run) {
        this.run = null
        this.forget()
      }
    }
  }

  // "Match — send the key".
  async confirm(): Promise<void> {
    const id = this.invitation.value?.id
    const { keys, joiner } = this
    if (this.phase.value !== 'compare' || id == null || keys == null || joiner == null) throw pairingState()
    this.phase.value = 'sending'
    const key = derivePairingKey({
      id,
      ownSecretKey: keys.secretKey,
      peerPublicKey: joiner.key,
      hostKey: keys.publicKey,
      joinerKey: joiner.key,
    })
    const ciphertext = sealPairingPayload(key, { v: 1, mnemonic: this.options.mnemonic, serverUrl: this.options.server })
    key.fill(0)
    try {
      await this.http.post('/invitations/:id/payload', { ciphertext: toB64Url(ciphertext) }, { params: { id } })
    } catch (error) {
      await this.abandon(relayError(error) ?? pairingUnreachable())
    }
  }

  // "They don't match": this invitation is burned, and the owner starts over with a new one.
  reject(): Promise<void> {
    return this.start()
  }

  async cancel(): Promise<void> {
    const run = this.run
    if (run == null) return
    this.run = null
    run.abort()
    const id = this.invitation.value?.id
    const settled = this.phase.value === 'done' || this.phase.value === 'expired' || this.phase.value === 'failed'
    if (!settled) this.phase.value = 'cancelled'
    this.forget()
    if (id != null && !settled) await this.http.delete('/invitations/:id', { params: { id } }).catch(() => {})
  }

  private async step(id: string): Promise<boolean> {
    const view = await this.http.get('/invitations/:id', { params: { id } })
    this.ttlSeconds.value = view.ttlSeconds
    switch (view.state) {
      case 'claimed': {
        if (this.hostNonce != null || view.joiner == null) return false
        this.joiner = { key: fromB64Url(view.joiner.key), commit: fromB64Url(view.joiner.commit) }
        this.deviceName.value = view.joiner.deviceName
        const hostNonce = generatePairingNonce()
        await this.http.post('/invitations/:id/nonce', { hostNonce: toB64Url(hostNonce) }, { params: { id } })
        this.hostNonce = hostNonce
        this.phase.value = 'connecting'
        return false
      }
      case 'revealed': {
        if (this.phase.value !== 'connecting') return false
        const { keys, joiner, hostNonce } = this
        if (keys == null || joiner == null || hostNonce == null || view.joinerNonce == null) throw pairingState()
        const joinerNonce = fromB64Url(view.joinerNonce)
        // Against the key captured at claim time, not whatever this poll says: the commit was made before
        // our nonce existed, and that ordering is the whole defence.
        if (!pairingCommitMatches(joiner.commit, joinerNonce, joiner.key)) {
          await this.abandon(pairingCommitMismatch())
          return true
        }
        this.joinerNonce = joinerNonce
        this.sas.value = derivePairingSas({ id, hostKey: keys.publicKey, joinerKey: joiner.key, hostNonce, joinerNonce })
        this.phase.value = 'compare'
        return false
      }
      case 'completed':
        this.phase.value = 'done'
        return true
      case 'cancelled':
        throw pairingCancelled()
      default:
        return false
    }
  }

  private settleFailure(error: AppError): void {
    this.error.value = error
    this.phase.value = error.body.code === 'PairingExpiredError' ? 'expired' : 'failed'
  }

  private async abandon(error: AppError): Promise<void> {
    const id = this.invitation.value?.id
    this.settleFailure(error)
    const run = this.run
    this.run = null
    run?.abort()
    this.forget()
    if (id != null) await this.http.delete('/invitations/:id', { params: { id } }).catch(() => {})
  }

  private forget(): void {
    wipe(this.keys)
    this.keys = null
    this.joiner = null
    this.hostNonce = null
    this.joinerNonce = null
  }
}

export type PairingJoinerPhase = 'idle' | 'claiming' | 'waiting' | 'compare' | 'received' | 'expired' | 'cancelled' | 'failed'

export interface PairingJoinerOptions {
  server: string
  // The invitation id from a QR, or the code as the person typed it.
  ref: string
  deviceName: string
  fetch?: typeof fetch
  pollMs?: number
}

// The new device's half. It has no identity, so it talks to the relay unsigned and proves it is the
// device that claimed with the token the claim handed back.
//
// The owner confirms the digits on this device too. The first device's "Match" only decides whether
// the real phrase is sent; a relay that swapped the host key could still seal a phrase of its own to
// this device, and only the owner's word here keeps that from being opened and stored.
export class PairingJoiner {
  readonly phase: Ref<PairingJoinerPhase> = ref('idle')
  readonly sas: Ref<string | null> = ref(null)
  // "They match" was given on this device; the payload is opened only after it.
  readonly matched = ref(false)
  readonly ttlSeconds = ref(0)
  readonly error: ShallowRef<AppError | null> = shallowRef(null)

  private readonly options: PairingJoinerOptions
  private readonly http: ReturnType<typeof createTypedHttp<PairingApp>>
  private token: string | null = null
  private id: string | null = null
  private run: AbortController | null = null

  constructor(options: PairingJoinerOptions) {
    this.options = options
    const withToken: ConfiguredMiddleware = (next) => (url, opts) =>
      next(url, this.token == null ? opts : { ...opts, headers: { ...opts.headers, [PAIR_TOKEN_HEADER]: this.token } })
    this.http = createTypedHttp<PairingApp>({
      baseUrl: apiBaseUrl(options.server, PAIRING_NAMESPACE),
      middlewares: [withToken],
      fetch: options.fetch,
    })
  }

  // Resolves with the phrase and server once the owner confirmed the digits here, the first device
  // sent them and the relay was told they arrived; rejects with the reason otherwise (also left in
  // `error`, with `phase` settled).
  async start(): Promise<PairingPayload> {
    const run = new AbortController()
    this.run = run
    const ref = isInvitationId(this.options.ref) ? this.options.ref : normalizeInvitationCode(this.options.ref)
    let keys: PairingKeyPair | null = generatePairingKeyPair()
    const joinerNonce = generatePairingNonce()
    // Pinned the first time it is seen, before our nonce leaves the device. A relay that took the
    // reveal and then served another host nonce could grind one that steers these digits onto the
    // first device's; with the pin, any other value ends the pairing.
    let hostNonce: Uint8Array | null = null
    const received: { payload?: PairingPayload } = {}
    this.phase.value = 'claiming'
    try {
      if (ref == null) throw validation('That is not an invitation code')
      const claimed = await this.http.post(
        '/join/:id',
        {
          joinerKey: toB64Url(keys.publicKey),
          commit: toB64Url(pairingCommit(joinerNonce, keys.publicKey)),
          deviceName: this.options.deviceName,
        },
        { params: { id: ref } },
      )
      const id = claimed.id
      const hostKey = fromB64Url(claimed.hostKey)
      this.id = id
      this.token = claimed.token
      this.ttlSeconds.value = claimed.ttlSeconds
      this.phase.value = 'waiting'
      await pollUntil(run.signal, this.options.pollMs ?? DEFAULT_POLL_MS, async () => {
        const view = await this.http.get('/join/:id', { params: { id } })
        this.ttlSeconds.value = view.ttlSeconds
        if (view.state === 'cancelled') throw pairingCancelled()
        if (view.hostNonce != null) {
          const seen = fromB64Url(view.hostNonce)
          if (hostNonce == null) hostNonce = seen
          else if (!constantTimeEqual(hostNonce, seen)) throw pairingCommitMismatch()
        }
        if (view.state === 'nonced' && hostNonce != null && keys != null) {
          if (this.sas.value == null) {
            this.sas.value = derivePairingSas({ id, hostKey, joinerKey: keys.publicKey, hostNonce, joinerNonce })
            this.phase.value = 'compare'
          }
          // Re-sent as is when the relay did not take it: the nonce and the digits never change.
          await this.http.post('/join/:id/reveal', { joinerNonce: toB64Url(joinerNonce) }, { params: { id } })
          return false
        }
        if (view.state === 'delivered' && view.ciphertext != null && keys != null && this.matched.value) {
          const key = derivePairingKey({ id, ownSecretKey: keys.secretKey, peerPublicKey: hostKey, hostKey, joinerKey: keys.publicKey })
          try {
            received.payload = openPairingPayload(key, fromB64Url(view.ciphertext))
          } finally {
            key.fill(0)
          }
          await this.http.post('/join/:id/ack', undefined, { params: { id } })
          return true
        }
        return false
      })
      if (received.payload == null) throw pairingState()
      this.phase.value = 'received'
      return received.payload
    } catch (error) {
      const reason = run.signal.aborted
        ? isAppError(run.signal.reason)
          ? run.signal.reason
          : pairingCancelled('Cancelled on this device.')
        : (relayError(error) ?? pairingUnreachable())
      if (!run.signal.aborted) {
        this.error.value = reason
        this.phase.value =
          reason.body.code === 'PairingExpiredError' ? 'expired' : reason.body.code === 'PairingCancelledError' ? 'cancelled' : 'failed'
        // A payload this device could not open, or any other local failure, still leaves the invitation
        // open on the relay; ending it tells the first device at once instead of at expiry.
        await this.release()
      }
      throw reason
    } finally {
      wipe(keys)
      keys = null
      if (this.run === run) this.run = null
    }
  }

  // "They match" on this device.
  confirm(): void {
    if (this.phase.value !== 'compare') throw pairingState()
    this.matched.value = true
  }

  // "They don't match": nothing the relay holds is opened, and the invitation is ended for both sides.
  async reject(): Promise<void> {
    if (this.phase.value !== 'compare') throw pairingState()
    const reason = pairingSasMismatch()
    const run = this.run
    this.run = null
    this.error.value = reason
    this.phase.value = 'failed'
    run?.abort(reason)
    await this.release()
  }

  async cancel(): Promise<void> {
    const run = this.run
    this.run = null
    run?.abort()
    if (this.phase.value !== 'received') this.phase.value = 'cancelled'
    await this.release()
  }

  private async release(): Promise<void> {
    const id = this.id
    if (id == null || this.token == null) return
    this.id = null
    await this.http.delete('/join/:id', { params: { id } }).catch(() => {})
  }
}
