import { formatBytes } from '@arxhub/stdlib/format/bytes'
import type { ServerStatus } from './server-check'

export interface ServerStatusLine {
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  text: string
  pending?: boolean
}

// `new` asks for a server to start a vault on; `join` for the one an existing vault is already on, where
// an empty answer is the thing to warn about rather than the thing expected.
export type ServerPurpose = 'new' | 'join'

export function serverStatusLine(status: ServerStatus, purpose: ServerPurpose): ServerStatusLine | null {
  switch (status.kind) {
    case 'idle':
      return null
    case 'invalid':
      return { tone: 'danger', text: "That isn't a server address — for example https://hub.example.com" }
    case 'checking':
      return { tone: 'neutral', text: 'Checking…', pending: true }
    case 'found': {
      const { summary } = status
      if (summary.empty) {
        return purpose === 'join'
          ? { tone: 'warning', text: 'No vault for this phrase on this server yet' }
          : { tone: 'success', text: 'Server responds · vault is empty' }
      }
      const documents = `${summary.documents.toLocaleString('en-US')} ${summary.documents === 1 ? 'document' : 'documents'}`
      return { tone: 'success', text: `Vault found · ${documents} · ${formatBytes(summary.bytes)}` }
    }
    case 'unreachable':
      return { tone: 'danger', text: 'The server did not respond — check the address' }
    case 'other-vault':
      return { tone: 'danger', text: 'This server belongs to another vault' }
    case 'refused':
      return status.reason === 'stale'
        ? { tone: 'danger', text: "The server refused this device — check this device's clock" }
        : { tone: 'danger', text: 'The server refused this device' }
  }
}
