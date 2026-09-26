import { API_PREFIX } from '@arxhub/core'
import { b64UrlLength, PAIRING_ID_BYTES, PAIRING_KEY_BYTES, PAIRING_NONCE_BYTES, PAIRING_TOKEN_BYTES } from '@arxhub/crypto'
import { type Static, Type } from '@sinclair/typebox'
import { serverManifest } from '../manifest'

// Protocol limits shared by the relay and both clients, not tunables: changing one changes the wire.
export const PAIRING_NAMESPACE = serverManifest.namespace
export const PAIRING_TTL_MS = 5 * 60_000
export const MAX_OPEN_INVITATIONS = 4
export const MAX_CIPHERTEXT_BYTES = 4096
export const MAX_DEVICE_NAME_LENGTH = 64
// Everything a joiner may legitimately send fits in well under this; the guard reads no more.
export const MAX_JOIN_BODY_BYTES = 8 * 1024

export const PAIR_TOKEN_HEADER = 'x-arx-pair-token'

// The only paths the guard lets through unsigned for writes: a joining device has no identity yet.
export const PAIRING_JOIN_PREFIX = `${API_PREFIX}/${PAIRING_NAMESPACE}/join`

// Joiner-side rate limits, per invitation.
export const JOIN_RATE_PER_SECOND = 4
export const JOIN_BURST = 8
export const JOIN_REQUESTS_PER_INVITATION = 600
// Server-wide budget for claims that find nothing: the one place a code could be enumerated.
export const CLAIM_MISSES_PER_MINUTE = 30

export const PAIRING_STATES = ['open', 'claimed', 'nonced', 'revealed', 'delivered', 'completed', 'cancelled'] as const
export type PairingState = (typeof PAIRING_STATES)[number]

const b64Url = (bytes: number) => Type.String({ pattern: `^[A-Za-z0-9_-]{${b64UrlLength(bytes)}}$` })

export const pairingKeyWire = b64Url(PAIRING_KEY_BYTES)
export const pairingNonceWire = b64Url(PAIRING_NONCE_BYTES)
export const pairingCommitWire = b64Url(32)
export const pairingTokenWire = b64Url(PAIRING_TOKEN_BYTES)
export const pairingIdWire = b64Url(PAIRING_ID_BYTES)

export const createInvitationBody = Type.Object({ hostKey: pairingKeyWire })
export const hostNonceBody = Type.Object({ hostNonce: pairingNonceWire })
export const payloadBody = Type.Object({
  ciphertext: Type.String({ pattern: '^[A-Za-z0-9_-]+$', maxLength: b64UrlLength(MAX_CIPHERTEXT_BYTES) }),
})
export const claimBody = Type.Object({
  joinerKey: pairingKeyWire,
  commit: pairingCommitWire,
  deviceName: Type.String({ maxLength: MAX_DEVICE_NAME_LENGTH }),
})
export const revealBody = Type.Object({ joinerNonce: pairingNonceWire })
// A ref is an id or a typed code; both are short, and anything longer is not worth a lookup.
export const pairingRefParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 32 }) })

export type ClaimBody = Static<typeof claimBody>

export interface CreatedInvitation {
  id: string
  code: string
  expiresAt: number
  ttlSeconds: number
}

export interface HostView {
  state: PairingState
  ttlSeconds: number
  joiner?: { key: string; commit: string; deviceName: string }
  joinerNonce?: string
}

export interface ClaimedInvitation {
  id: string
  hostKey: string
  token: string
  ttlSeconds: number
}

export interface JoinerView {
  state: PairingState
  ttlSeconds: number
  hostNonce?: string
  ciphertext?: string
}
