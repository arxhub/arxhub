import { NOTES_TYPE_ID } from '@arxhub/plugin-notes/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'

export interface OpenDocument {
  open(path: string, text?: string): void
}

export function useOpenDocument(): OpenDocument {
  const arxhub = useArxHub()
  const shell = arxhub.extensions.get(ShellExtension)

  function open(path: string, text?: string): void {
    shell.workspace.openObject(NOTES_TYPE_ID, { id: path, ...(text ? { at: { text } } : {}) }).catch((error) => {
      arxhub.logger.error(`[search] failed to open ${path}`, error)
      toaster.create({ title: 'Could not open the note', description: path, type: 'error' })
    })
  }

  return { open }
}
