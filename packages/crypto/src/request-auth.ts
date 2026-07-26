import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { verifyAuth } from './auth'
import type { Keyring } from './keyring'

// Header names carried on every authenticated request. Kept lowercase to match HTTP's
// case-insensitive handling and avoid surprises across fetch/Elysia.
export const AUTH_HEADERS = {
  timestamp: 'x-arx-timestamp',
  nonce: 'x-arx-nonce',
  signature: 'x-arx-signature',
  publicKey: 'x-arx-pubkey',
  // Response-only, set by the server on a 401 (see AuthDenyReason). Never sent by the client, so it is
  // deliberately absent from the CORS request allowlist — it needs exposing instead.
  reason: 'x-arx-auth-reason',
} as const

// The client-attached authentication fields for one request.
export interface SignedRequestHeaders {
  // Unix seconds (as string) when the request was signed — the server enforces a freshness window.
  timestamp: string
  // Random per-request value; the server rejects a nonce it has already seen within the window.
  nonce: string
  // Hex secp256k1 signature over the canonical string.
  signature: string
  // Client xpub — lets a not-yet-paired (TOFU) server pin it; a paired server checks it against the pin.
  publicKey: string
}

// Identifies the request being signed. `body` is hashed (never included raw) so the signed payload is
// bounded regardless of upload size, while still binding the exact bytes. `host` binds the signature
// to the server the client targeted (URL host, port included when non-default), so a captured request
// can't be replayed against a different server that pins the same key.
export interface RequestDescriptor {
  method: string
  host?: string
  path: string
  query?: string
  body?: Uint8Array
}

// Deterministic canonical serialization signed by the client and reconstructed by the server. Every
// field that must not be tampered with is included: method, host, path, query, timestamp, nonce, and a
// hash of the body. Newline-separated; method upper-cased so 'get'/'GET' can't diverge. The server
// reconstructs host from the request's Host header — a reverse proxy MUST forward it unchanged
// (nginx: `proxy_set_header Host $host`) or every signature check fails closed.
export function buildCanonicalString(desc: RequestDescriptor, timestamp: number, nonce: string): Uint8Array {
  const bodyHash = bytesToHex(sha256(desc.body ?? new Uint8Array()))
  const canonical = [desc.method.toUpperCase(), desc.host ?? '', desc.path, desc.query ?? '', String(timestamp), nonce, bodyHash].join('\n')
  return utf8ToBytes(canonical)
}

// Client side: sign a request with the keyring's auth key. timestamp/nonce are generated here but may
// be injected for tests. Returns the headers to attach (see AUTH_HEADERS for the wire names).
export function signRequest(
  keyring: Keyring,
  desc: RequestDescriptor,
  opts: { timestamp?: number; nonce?: string } = {},
): SignedRequestHeaders {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = opts.nonce ?? bytesToHex(randomBytes(16))
  const signature = bytesToHex(keyring.sign(buildCanonicalString(desc, timestamp, nonce)))
  return { timestamp: String(timestamp), nonce, signature, publicKey: keyring.authPublicKey }
}

// Server side: verify ONLY that `headers.signature` is a valid signature by `publicKey` over the
// canonical string for `desc`. Freshness (timestamp window), replay (nonce reuse), and key pinning
// (TOFU) are policy owned by the caller (the protection server plugin), not this pure function.
export function verifyRequestSignature(publicKey: string, desc: RequestDescriptor, headers: SignedRequestHeaders): boolean {
  const timestamp = Number(headers.timestamp)
  if (!Number.isInteger(timestamp)) return false
  let signature: Uint8Array
  try {
    signature = hexToBytes(headers.signature)
  } catch {
    return false
  }
  return verifyAuth(publicKey, buildCanonicalString(desc, timestamp, headers.nonce), signature)
}

// Client-side abstraction the HTTP layer depends on: turn a request into auth headers, or null when
// no identity is configured yet (request goes out unauthenticated and the server will 401 if it
// requires auth). Keeps @arxhub/http/@arxhub/vfs-http decoupled from the keyring's lifecycle.
export interface RequestSigner {
  sign(desc: RequestDescriptor): SignedRequestHeaders | null
}

// A RequestSigner whose keyring is installed after construction — created at the composition root
// (instance main.ts), handed to the HTTP client immediately, then populated by the protection plugin
// once the mnemonic is read from config. Before install(), sign() returns null.
export class MutableRequestSigner implements RequestSigner {
  private keyring: Keyring | null = null

  install(keyring: Keyring): void {
    this.keyring = keyring
  }

  clear(): void {
    this.keyring = null
  }

  get installed(): boolean {
    return this.keyring != null
  }

  sign(desc: RequestDescriptor): SignedRequestHeaders | null {
    return this.keyring == null ? null : signRequest(this.keyring, desc)
  }
}
