import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { ShellExtension } from '@arxhub/plugin-shell'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'

// What a result row hands the opener: the matched text, and — when the index has it — the exact block
// to land on rather than merely the first one that reads the same. `blockId` is the `.arx` block's own
// stable id (A-29 — markdown carries none); `occurrence` is the fallback for a format that does not,
// counting how many earlier blocks already had this exact content.
export interface OpenAt {
  text?: string
  blockId?: string
  occurrence?: number
}

export interface OpenDocument {
  open(path: string, at?: OpenAt): void
}

export function useOpenDocument(): OpenDocument {
  const arxhub = useArxHub()
  const shell = arxhub.extensions.get(ShellExtension)

  function open(path: string, at?: OpenAt): void {
    // `text` is required even when a blockId is given (blockAnchorOf refuses an anchor with no text
    // field at all) — always present here, since it always comes from the block's own content.
    const anchor =
      at == null || (!at.text && !at.blockId)
        ? undefined
        : { text: at.text ?? '', ...(at.blockId ? { blockId: at.blockId } : {}), ...(at.occurrence ? { skip: at.occurrence } : {}) }
    shell.workspace.openObject(NOTES_TYPE_ID, { id: path, ...(anchor ? { at: anchor } : {}) }).catch((error) => {
      arxhub.logger.error(`[search] failed to open ${path}`, error)
      toaster.create({ title: 'Could not open the note', description: path, type: 'error' })
    })
  }

  return { open }
}
