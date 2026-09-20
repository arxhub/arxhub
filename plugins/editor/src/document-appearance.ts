import { validation } from '@arxhub/errors'
import type { Node } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { type ArxAsset, isImageAsset, validateAssetPath } from './assets'
import { isRecord } from './document-migrations'
import { editorMode } from './editor-mode'

export interface DocumentAppearance {
  icon: string | null
  cover: ArxAsset | null
}

export function parseAppearance(value: unknown): DocumentAppearance {
  if (value == null) return { icon: null, cover: null }
  if (!isRecord(value)) throw validation('Invalid page appearance')
  const icon = value.icon ?? null
  if (icon !== null && (typeof icon !== 'string' || icon.length > 32 || !icon.trim())) throw validation('Invalid page icon')
  const cover = value.cover ?? null
  if (cover !== null) {
    if (
      !isRecord(cover) ||
      typeof cover.path !== 'string' ||
      typeof cover.name !== 'string' ||
      typeof cover.mime !== 'string' ||
      !isImageAsset(cover.mime) ||
      typeof cover.size !== 'number' ||
      !Number.isFinite(cover.size) ||
      cover.size < 0
    )
      throw validation('Invalid page cover')
    validateAssetPath(cover.path)
  }
  return { icon: icon as string | null, cover: cover as ArxAsset | null }
}

export function documentAppearance(doc: Node): DocumentAppearance {
  return parseAppearance(doc.attrs.arxEnvelope?.envelope?.appearance)
}

export function changeAppearance(view: EditorView, appearance: DocumentAppearance): void {
  if (view.isDestroyed || editorMode(view.state) !== 'editable') return
  const valid = parseAppearance(appearance)
  const metadata = view.state.doc.attrs.arxEnvelope ?? {}
  const envelope = metadata.envelope ?? {}
  // One ordinary transaction: autosave, undo, drafts and versions include decoration edits too.
  view.dispatch(
    view.state.tr.setDocAttribute('arxEnvelope', {
      ...metadata,
      envelope: { ...envelope, appearance: { ...envelope.appearance, ...valid } },
    }),
  )
}
