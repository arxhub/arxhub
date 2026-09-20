import type { Attrs, Node } from 'prosemirror-model'
import { type Command, type EditorState, NodeSelection, Plugin, PluginKey, Selection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { ArxEditorComponent } from './editor-extension'
import { editorMode } from './editor-mode'

export type InspectorTarget = { kind: 'page' } | { kind: 'block'; pos: number; type: string; id: string | null } | null
export const inspectorKey = new PluginKey<InspectorTarget>('arx-inspector')
export const BLOCK_SETTINGS_LABELS: Readonly<Record<string, string>> = {
  columns: 'Columns',
  table: 'Table',
  select: 'Dropdown',
  data_view: 'Collection',
  code_block: 'Code',
  image_block: 'Image',
  attachment: 'Attachment',
  callout: 'Callout',
  section: 'Section',
}
export function settingsLabel(node: Node, components: Readonly<Record<string, ArxEditorComponent>> = {}): string | null {
  const definition = components[node.type.name]
  return definition?.settings ? (definition.settingsLabel ?? node.type.name) : (BLOCK_SETTINGS_LABELS[node.type.name] ?? null)
}
export function settingsAt(state: EditorState, pos: number, components: Readonly<Record<string, ArxEditorComponent>> = {}): number | null {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  if ($pos.nodeAfter && settingsLabel($pos.nodeAfter, components)) return $pos.pos
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (settingsLabel($pos.node(depth), components)) return $pos.before(depth)
  }
  return null
}
export function blockTarget(doc: Node, pos: number): InspectorTarget {
  const node = doc.nodeAt(pos)
  return node ? { kind: 'block', pos, type: node.type.name, id: node.attrs.arxId ?? null } : null
}
export function inspectorPlugin(): Plugin<InspectorTarget> {
  return new Plugin<InspectorTarget>({
    key: inspectorKey,
    state: {
      init: () => null,
      apply(tr, previous) {
        const explicit = tr.getMeta(inspectorKey)
        if (explicit !== undefined) return explicit
        if (!previous || previous.kind === 'page' || !tr.docChanged) return previous
        // The inspector follows the chosen block, including moves. A caret change never retargets it.
        if (previous.id) {
          let found: InspectorTarget = null
          tr.doc.descendants((node, pos) => {
            if (node.type.name === previous.type && node.attrs.arxId === previous.id) found = { ...previous, pos }
          })
          return found
        }
        const mapped = tr.mapping.mapResult(previous.pos, 1)
        return !mapped.deleted && tr.doc.nodeAt(mapped.pos)?.type.name === previous.type ? { ...previous, pos: mapped.pos } : null
      },
    },
  })
}
export function inspect(view: EditorView, target: InspectorTarget): void {
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(inspectorKey, target).setMeta('addToHistory', false))
}
export function changeInspectedBlock(view: EditorView, attrs: Attrs, pinned = inspectorKey.getState(view.state)): void {
  if (view.isDestroyed || editorMode(view.state) !== 'editable') return
  let target = pinned
  if (target?.kind !== 'block') return
  if (target.id) {
    const id = target.id
    let pos: number | null = null
    view.state.doc.descendants((node, at) => {
      if (node.attrs.arxId === id) pos = at
    })
    if (pos === null) return
    target = { ...target, pos }
  }
  const node = view.state.doc.nodeAt(target.pos)
  if (!node || node.type.name !== target.type) return
  const next = node.type.create({ ...node.attrs, ...attrs }, node.content, node.marks)
  next.check()
  view.dispatch(view.state.tr.setNodeMarkup(target.pos, undefined, next.attrs))
}
export function replaceInspectedBlock(view: EditorView, nodes: readonly Node[], pinned = inspectorKey.getState(view.state)): void {
  if (view.isDestroyed || editorMode(view.state) !== 'editable' || pinned?.kind !== 'block') return
  let pos: number | null = pinned.id ? null : pinned.pos
  if (pinned.id)
    view.state.doc.descendants((node, at) => {
      if (node.attrs.arxId === pinned.id) pos = at
    })
  if (pos === null) return
  const current = view.state.doc.nodeAt(pos)
  if (current?.type.name !== pinned.type) return
  const parent = view.state.doc.resolve(pos).parent
  const content = nodes.length || parent.childCount > 1 ? nodes : [view.state.schema.nodes.paragraph.create()]
  view.dispatch(view.state.tr.replaceWith(pos, pos + current.nodeSize, content))
}
// Commands receive a selection on the pinned block, regardless of where the caret has since moved.
export function runInspectedCommand(view: EditorView, command: Command, inside = false): void {
  if (view.isDestroyed || editorMode(view.state) !== 'editable') return
  const target = inspectorKey.getState(view.state)
  if (target?.kind !== 'block') return
  const state = view.state
  const selection = inside ? Selection.near(state.doc.resolve(target.pos + 1)) : NodeSelection.create(state.doc, target.pos)
  const selected = state.apply(state.tr.setSelection(selection))
  command(selected, (tr) => view.dispatch(tr), view)
}
