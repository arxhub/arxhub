import type { Logger } from '@arxhub/logger'
import { toaster } from '@arxhub/uikit/hooks'
import type { DocumentsExtension } from '../documents-extension'
import { errorReason } from '../i18n/error-reason'
import { t } from '../i18n/messages'

// What a typed name becomes, in the one place both roads to a rename share: the name at the top of a
// document and the phone's Rename. The field holds the name as it is SHOWN, so `fullName` glues a hidden
// extension back on, and a rename started by a hand reports its own failure — a rejected write with only a
// log entry behind it reads exactly like a name that did not change.
export function renameDocument(documents: DocumentsExtension, logger: Logger, path: string, typed: string): void {
  const name = documents.displayName(path)
  const trimmed = typed.trim()
  if (trimmed === '' || trimmed === name.text) return
  const renamed = name.fullName(trimmed)
  documents.renameObject(path, renamed).catch((error: unknown) => {
    logger.error(`[documents] failed to rename ${path} to ${renamed}:`, error)
    toaster.create({ type: 'error', title: t('actions.renameFailed', { name: renamed }), description: errorReason(error) })
  })
}
