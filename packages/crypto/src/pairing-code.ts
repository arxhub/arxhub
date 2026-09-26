import { validation } from '@arxhub/errors'
import { randomBytes } from '@noble/hashes/utils.js'

const B64URL_PATTERN = /^[A-Za-z0-9_-]*$/

export function toB64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Strict: only the unpadded alphabet, and only the canonical spelling of the bytes. A lenient decoder
// maps several strings onto one value (trailing bits are ignored by atob), and the relay compares ids
// and tokens as strings — two spellings of one token must not both be accepted.
export function fromB64Url(text: string): Uint8Array {
  if (!B64URL_PATTERN.test(text) || text.length % 4 === 1) throw validation('Not base64url')
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  if (toB64Url(bytes) !== text) throw validation('Not canonical base64url')
  return bytes
}

// Byte lengths of the pairing wire values, and the base64url lengths they encode to.
export const PAIRING_ID_BYTES = 16
export const PAIRING_TOKEN_BYTES = 32
export const PAIRING_NONCE_BYTES = 16
export const PAIRING_KEY_BYTES = 32

export const b64UrlLength = (bytes: number): number => Math.ceil((bytes * 4) / 3)

export const generateInvitationId = (): string => toB64Url(randomBytes(PAIRING_ID_BYTES))
export const generatePairingToken = (): string => toB64Url(randomBytes(PAIRING_TOKEN_BYTES))
export const generatePairingNonce = (): Uint8Array => randomBytes(PAIRING_NONCE_BYTES)

// Crockford base32: no I, L, O or U, so the code survives being read aloud or copied by hand.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const INVITATION_CODE_LENGTH = 8

// 40 bits. The code only finds an invitation that lives five minutes and can be claimed once; it holds
// no key, so its length is set by enumeration against the relay's miss budget, not by secrecy.
export function generateInvitationCode(): string {
  const bytes = randomBytes(5)
  let bits = 0n
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte)
  let code = ''
  for (let i = INVITATION_CODE_LENGTH - 1; i >= 0; i--) code += CROCKFORD[Number((bits >> BigInt(i * 5)) & 31n)]
  return code
}

export function formatInvitationCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export function normalizeInvitationCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (code.length !== INVITATION_CODE_LENGTH) return null
  for (const char of code) if (!CROCKFORD.includes(char)) return null
  return code
}

const QR_PREFIX = 'arxhub://pair?'
const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${b64UrlLength(PAIRING_ID_BYTES)}}$`)

export const isInvitationId = (text: string): boolean => ID_PATTERN.test(text)

function serverOrigin(server: string): string | null {
  try {
    const url = new URL(server)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.search || url.hash) return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

export interface InvitationRef {
  server: string
  id: string
}

export function invitationQr(server: string, id: string): string {
  const origin = serverOrigin(server)
  if (origin == null) throw validation(`Not a server address: ${server}`)
  if (!isInvitationId(id)) throw validation('Not an invitation id')
  return `${QR_PREFIX}v=1&server=${encodeURIComponent(origin)}&id=${id}`
}

// Strict on purpose: a camera reads whatever QR it is pointed at, so anything that is not exactly an
// invitation of this version is refused rather than guessed at.
export function parseInvitationQr(text: string): InvitationRef | null {
  if (!text.startsWith(QR_PREFIX)) return null
  const fields = text.slice(QR_PREFIX.length).split('&')
  if (fields.length !== 3) return null
  const values = new Map<string, string>()
  for (const field of fields) {
    const eq = field.indexOf('=')
    if (eq <= 0) return null
    const key = field.slice(0, eq)
    if (values.has(key)) return null
    let value: string
    try {
      value = decodeURIComponent(field.slice(eq + 1))
    } catch {
      return null
    }
    values.set(key, value)
  }
  if (values.get('v') !== '1') return null
  const id = values.get('id')
  const server = values.get('server')
  if (id == null || server == null || !isInvitationId(id)) return null
  const origin = serverOrigin(server)
  if (origin == null || origin !== server) return null
  return { server: origin, id }
}
