import type { Logger } from '@arxhub/logger'
import { basename } from '@arxhub/path'
import type { Workspace } from '@arxhub/plugin-shell'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import type { DocumentsExtension } from '../documents-extension'
import { DOCUMENTS_TYPE_ID } from '../documents-type'
import { errorReason } from '../i18n/error-reason'
import { t } from '../i18n/messages'
import RenameDocumentSheet from './RenameDocumentSheet.vue'

// The band's own actions on the open document — the ones every file has, whatever opens it. A viewer adds
// its tools between Close and Delete (`registerViewBar`); these frame them.
export function documentActions(
  documents: DocumentsExtension,
  workspace: Workspace,
  logger: Logger,
  path: string,
  key: string,
): { rename: ActionItem; close: ActionItem; remove: ActionItem } {
  const rename: ActionItem = {
    id: 'documents.rename',
    label: t('actions.rename'),
    icon: 'lu:pencil',
    onSelect: () => void modals.openSurface({ component: RenameDocumentSheet, props: { path } }),
  }
  const close: ActionItem = {
    id: 'documents.close',
    label: t('actions.close'),
    icon: 'lu:x',
    onSelect: () => void workspace.closeObject(DOCUMENTS_TYPE_ID, key),
  }
  const remove: ActionItem = {
    id: 'documents.delete',
    label: t('actions.delete'),
    icon: 'lu:trash-2',
    tone: 'danger',
    onSelect: () => {
      const name = basename(path)
      modals.openConfirmModal({
        title: t('actions.delete'),
        content: t('actions.deleteConfirm', { name }),
        labels: { confirm: t('actions.delete'), cancel: t('actions.cancel') },
        confirmProps: { danger: true },
        onConfirm: () => {
          // Discarded, not closed: closing saves first, and a save landing after the delete would bring
          // the file straight back.
          void Promise.resolve(workspace.closeObject(DOCUMENTS_TYPE_ID, key, { discard: true }))
            .then(() => documents.deleteObject(path))
            .catch((error: unknown) => {
              logger.error(`[documents] failed to delete ${path}:`, error)
              toaster.create({ type: 'error', title: t('actions.deleteFailed', { name }), description: errorReason(error) })
            })
        },
      })
    },
  }
  return { rename, close, remove }
}
