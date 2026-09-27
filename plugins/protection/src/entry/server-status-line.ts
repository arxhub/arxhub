import { formatBytes } from '@arxhub/i18n'
import { t } from '../i18n/messages'
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
      return { tone: 'danger', text: t('common.notAddress') }
    case 'checking':
      return { tone: 'neutral', text: t('entry.status.checking'), pending: true }
    case 'found': {
      const { summary } = status
      if (summary.empty) {
        return purpose === 'join'
          ? { tone: 'warning', text: t('entry.status.emptyJoin') }
          : { tone: 'success', text: t('entry.status.emptyNew') }
      }
      const documents = t('entry.status.documents', { count: summary.documents })
      return { tone: 'success', text: t('entry.status.found', { documents, size: formatBytes(summary.bytes) }) }
    }
    case 'unreachable':
      return { tone: 'danger', text: t('entry.status.unreachable') }
    case 'other-vault':
      return { tone: 'danger', text: t('entry.status.otherVault') }
    case 'refused':
      return status.reason === 'stale'
        ? { tone: 'danger', text: t('entry.status.refusedClock') }
        : { tone: 'danger', text: t('entry.status.refused') }
  }
}
