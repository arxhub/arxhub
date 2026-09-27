import { DOCUMENTS_TYPE_ID } from '@arxhub/plugin-documents'
import { ShellExtension } from '@arxhub/plugin-shell'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { t } from '../i18n/messages'

// What a result row hands the opener: the matched text, and — when the index has it — the exact place
// to land on rather than merely the first one that reads the same. `blockId` is the unit in its format's
// terms (an `.arx` block id, a cell address — markdown carries none, A-29); `part` is the part of a
// composite object (a worksheet, a PDF page); `occurrence` is the fallback for a format with neither,
// counting how many earlier blocks already had this exact content.
export interface OpenAt {
  text?: string
  blockId?: string
  part?: string
  occurrence?: number
}

export interface OpenDocument {
  open(path: string, at?: OpenAt): void
}

export function useOpenDocument(): OpenDocument {
  const arxhub = useArxHub()
  const shell = arxhub.extensions.get(ShellExtension)

  function open(path: string, at?: OpenAt): void {
    // `text` is required even when a blockId or a part is given (blockAnchorOf refuses an anchor with no
    // text field at all), so an address without matched text carries an empty one.
    const anchor =
      at == null || (!at.text && !at.blockId && !at.part)
        ? undefined
        : {
            text: at.text ?? '',
            ...(at.blockId ? { blockId: at.blockId } : {}),
            ...(at.part ? { part: at.part } : {}),
            ...(at.occurrence ? { skip: at.occurrence } : {}),
          }
    shell.workspace.openObject(DOCUMENTS_TYPE_ID, { id: path, ...(anchor ? { at: anchor } : {}) }).catch((error) => {
      arxhub.logger.error(`[search] failed to open ${path}`, error)
      toaster.create({ title: t('results.openFailed'), description: path, type: 'error' })
    })
  }

  return { open }
}
