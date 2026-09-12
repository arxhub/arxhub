import { Mark, type Node } from 'prosemirror-model'
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export type EditorMode = 'readonly' | 'editable' | 'interactive'

export const editorModeKey = new PluginKey<EditorMode>('editor-mode')

export type ControlPolicy = Readonly<Record<string, (value: unknown, before: Node) => boolean>>

export const DEFAULT_CONTROL_POLICIES: Readonly<Record<string, ControlPolicy>> = {
  task_item: { checked: (value) => typeof value === 'boolean' },
  select: { value: (value, before) => value === null || (typeof value === 'string' && selectOptions(before).includes(value)) },
}

export function editorMode(state: EditorState): EditorMode {
  return editorModeKey.getState(state) ?? 'editable'
}

// Compare the trees, not transaction metadata: paste, history and commands must obey the same boundary.
export function onlyControlValuesChanged(before: Node, after: Node, policies = DEFAULT_CONTROL_POLICIES): boolean {
  if (before.eq(after)) return true
  if (before.type !== after.type || before.text !== after.text || before.childCount !== after.childCount) return false
  if (!Mark.sameSet(before.marks, after.marks)) return false

  const policy = policies[before.type.name]
  for (const key of new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)])) {
    if (JSON.stringify(before.attrs[key]) === JSON.stringify(after.attrs[key])) continue
    if (!policy || !Object.hasOwn(policy, key) || !policy[key](after.attrs[key], before)) return false
  }
  for (let i = 0; i < before.childCount; i++) {
    if (!onlyControlValuesChanged(before.child(i), after.child(i), policies)) return false
  }
  return true
}

export function selectOptions(node: Node): string[] {
  const options: unknown = node.attrs.options
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string') : []
}

export function modePlugin(
  initial: EditorMode,
  policies = DEFAULT_CONTROL_POLICIES,
  componentNodes: readonly string[] = [],
): Plugin<EditorMode> {
  let decoratedDoc: Node | null = null
  let decoratedMode: EditorMode | null = null
  let decorated = DecorationSet.empty
  const names = new Set([...Object.keys(policies), ...componentNodes])
  return new Plugin<EditorMode>({
    key: editorModeKey,
    state: {
      init: () => initial,
      apply: (tr, mode) => {
        const next: unknown = tr.getMeta(editorModeKey)
        return next === 'readonly' || next === 'editable' || next === 'interactive' ? next : mode
      },
    },
    filterTransaction: (tr, state) => {
      if (!tr.docChanged) return true
      const mode = editorMode(state)
      return mode === 'editable' || (mode === 'interactive' && onlyControlValuesChanged(state.doc, tr.doc, policies))
    },
    props: {
      editable: (state) => editorMode(state) === 'editable',
      attributes: (state) => ({
        'data-mode': editorMode(state),
        tabindex: '0',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-readonly': String(editorMode(state) !== 'editable'),
        'aria-label': 'Document',
      }),
      decorations: (state) => {
        const mode = editorMode(state)
        if (state.doc === decoratedDoc && mode === decoratedMode) return decorated
        const decorations: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (names.has(node.type.name)) {
            // A mode change must update node views even though the document itself hasn't changed.
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-mode': mode }))
          }
        })
        decoratedDoc = state.doc
        decoratedMode = mode
        decorated = DecorationSet.create(state.doc, decorations)
        return decorated
      },
    },
  })
}
