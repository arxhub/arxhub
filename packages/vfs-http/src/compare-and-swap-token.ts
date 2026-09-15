import { validation } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'

// What the client expects the file to hold crosses the wire as a sha256 of those bytes, not as the bytes
// — a head is 64 characters, but the capability is generic and an expected value could be a whole
// file. `absent` is the one token that is not a hash: the file must not exist yet (a seed). Both ends
// import THIS module so the two sides cannot drift on the sentinel or the hash.
export const ABSENT_TOKEN = 'absent'

const TOKEN = /^([0-9a-f]{64}|absent)$/

export function expectedToken(expected: Uint8Array | null): string {
  return expected === null ? ABSENT_TOKEN : sha256(expected)
}

// The server side: rejects anything that is not a token before it is compared against a file, since
// the value arrives from the network.
export function parseExpectedToken(raw: unknown): string {
  const token = String(raw ?? '')
  if (!TOKEN.test(token)) throw validation('Expected content must be a sha256 hex or "absent"')
  return token
}

export function matchesToken(current: Uint8Array | null, token: string): boolean {
  if (current === null) return token === ABSENT_TOKEN
  return token !== ABSENT_TOKEN && sha256(current) === token
}
