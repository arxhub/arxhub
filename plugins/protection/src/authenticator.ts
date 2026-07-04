import { type RequestDescriptor, type SignedRequestHeaders, verifyRequestSignature } from '@arxhub/crypto'

export type AuthDenyReason = 'missing' | 'stale' | 'bad-signature' | 'unknown-key' | 'replay'
export type AuthResult = { ok: true; publicKey: string; pairedNow: boolean } | { ok: false; reason: AuthDenyReason }

export interface RequestAuthenticatorOptions {
  // A fixed public key (xpub) to trust. When omitted, the first request bearing a valid self-signature
  // pins its key (trust-on-first-use). When set, TOFU is disabled and only this key is ever accepted.
  pinnedPublicKey?: string
  // Max clock skew (seconds) allowed between the signed timestamp and the server clock. Default 30.
  toleranceSeconds?: number
  // Invoked once, with the pinned xpub, at the moment a key is pinned via TOFU. Lets the caller persist
  // it so a paired key survives a server restart (otherwise every restart reopens the TOFU window).
  // NOT called when pinnedPublicKey is configured (already fixed) nor for later requests from that key.
  onPair?: (publicKey: string) => void
}

// Stateful policy for authenticating signed requests: freshness window, replay (nonce) rejection, and
// TOFU key pinning. Framework-agnostic — the Elysia guard in ./server adapts HTTP requests to it, and
// it is unit-tested directly.
export class RequestAuthenticator {
  private pinned: string | null
  private readonly tolerance: number
  private readonly onPair?: (publicKey: string) => void
  // nonce → expiry (unix seconds). A nonce only matters within the freshness window, so expired
  // entries are pruned lazily on each call to keep the map bounded.
  private readonly seenNonces = new Map<string, number>()

  constructor(options: RequestAuthenticatorOptions = {}) {
    this.pinned = options.pinnedPublicKey ?? null
    this.tolerance = options.toleranceSeconds ?? 30
    this.onPair = options.onPair
  }

  get pinnedPublicKey(): string | null {
    return this.pinned
  }

  authenticate(desc: RequestDescriptor, headers: SignedRequestHeaders | null, nowSeconds: number): AuthResult {
    if (headers == null) return { ok: false, reason: 'missing' }

    const ts = Number(headers.timestamp)
    if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > this.tolerance) return { ok: false, reason: 'stale' }

    // Verify against the PRESENTED key first: this proves possession of the matching private key, so
    // TOFU only ever pins a key whose holder actually controls it.
    if (!verifyRequestSignature(headers.publicKey, desc, headers)) return { ok: false, reason: 'bad-signature' }

    let pairedNow = false
    if (this.pinned == null) {
      this.pinned = headers.publicKey
      pairedNow = true
      this.onPair?.(headers.publicKey)
    } else if (this.pinned !== headers.publicKey) {
      return { ok: false, reason: 'unknown-key' }
    }

    // Replay is checked AFTER the signature so an unauthenticated caller can't burn nonces.
    this.pruneExpired(nowSeconds)
    if (this.seenNonces.has(headers.nonce)) return { ok: false, reason: 'replay' }
    // Expiry is anchored to the SIGNED timestamp, not the server clock: the nonce must stay blocked
    // for as long as the timestamp itself is still within the freshness window. Using nowSeconds would
    // prune it early whenever the client clock runs ahead, leaving a replay hole equal to the skew.
    this.seenNonces.set(headers.nonce, ts + this.tolerance)

    return { ok: true, publicKey: headers.publicKey, pairedNow }
  }

  private pruneExpired(nowSeconds: number): void {
    for (const [nonce, expiry] of this.seenNonces) {
      if (expiry < nowSeconds) this.seenNonces.delete(nonce)
    }
  }
}
