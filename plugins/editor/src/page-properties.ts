import type { Attrs, Node } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { editorMode } from './editor-mode'

export function pageProperties(doc: Node): Node | null {
  const type = doc.type.schema.nodes.properties
  const raw = doc.attrs.arxEnvelope?.properties
  return type && raw ? type.create(raw.attrs) : null
}

export function changePageProperties(view: EditorView, attrs: Attrs): void {
  if (view.isDestroyed || editorMode(view.state) === 'readonly') return
  const type = view.state.schema.nodes.properties
  if (!type) return
  const metadata = view.state.doc.attrs.arxEnvelope ?? {}
  const existing = pageProperties(view.state.doc)
  if (!existing && editorMode(view.state) !== 'editable') return
  const properties = type.create({ ...existing?.attrs, ...attrs, arxId: existing ? existing.attrs.arxId : crypto.randomUUID() })
  properties.check()
  view.dispatch(view.state.tr.setDocAttribute('arxEnvelope', { ...metadata, properties: properties.toJSON() }))
}
