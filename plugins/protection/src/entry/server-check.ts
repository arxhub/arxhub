import { apiBaseUrl } from '@arxhub/core'
import { authRejections, keyringFromMnemonic, MutableRequestSigner } from '@arxhub/crypto'
import { isHttpError } from '@arxhub/http'
import { EncryptedSyncRemote, HttpSyncRemote, inspectRemote, type RemoteSummary, SYNC_NAMESPACE } from '@arxhub/sync'

// Where a server check stands, as the status line under the address reads it.
export type ServerStatus =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'checking' }
  | { kind: 'found'; summary: RemoteSummary }
  | { kind: 'unreachable' }
  // The server has pinned a different key: someone else's vault, or this owner's under another phrase.
  | { kind: 'other-vault' }
  // Refused for a reason that is not the pin — a clock too far off, most often.
  | { kind: 'refused'; reason: string | null }

export type ServerInspector = (serverUrl: string, mnemonic: string) => Promise<ServerStatus>

// What a person types into "Server address" is an origin, give or take a scheme and a slash; what sync
// stores is exactly the origin. Anything with a path, a query or a scheme other than http(s) is not a
// server address and is refused here rather than at the first request.
export function normalizeServerAddress(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '' || url.username !== '') return null
  return url.origin
}

// Asks the server what it holds for this phrase, before the app exists. Built from the phrase rather
// than from the running sync plugin, because there is no running anything yet.
//
// Note what a check does to a server nobody has used: its guard pins the first key that reaches it, so
// checking IS claiming it for this vault. That is intended — a new vault's first server becomes its
// server — and it is why the check runs only once the person has typed the address they mean.
export const inspectServer: ServerInspector = async (serverUrl, mnemonic) => {
  const keyring = keyringFromMnemonic(mnemonic)
  const signer = new MutableRequestSigner()
  signer.install(keyring)
  const remote = new EncryptedSyncRemote(new HttpSyncRemote({ baseUrl: apiBaseUrl(serverUrl, SYNC_NAMESPACE), signer }), keyring.encryptionKey)

  // The 401 alone cannot tell a pin from a clock; the reason the guard names can, and it reaches the
  // client through the one place every signed request reports a refusal.
  let reason: string | null = null
  const unsubscribe = authRejections.subscribe((rejection) => {
    reason = rejection.reason
  })
  try {
    return { kind: 'found', summary: await inspectRemote(remote) }
  } catch (error) {
    if (!isHttpError(error, 401)) return { kind: 'unreachable' }
    return reason === 'unknown-key' ? { kind: 'other-vault' } : { kind: 'refused', reason }
  } finally {
    unsubscribe()
  }
}
