import { Mark, type Node } from 'prosemirror-model'
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { isRecord } from './document-migrations'
import { isSelectOptionList, selectedLabel as labelOf, newSelectOptionId, type SelectOption } from './select-options'

export type EditorMode = 'readonly' | 'editable' | 'interactive'

export const editorModeKey = new PluginKey<EditorMode>('editor-mode')

export type ControlPolicy = Readonly<Record<string, (value: unknown, before: Node) => boolean>>

export const DEFAULT_CONTROL_POLICIES: Readonly<Record<string, ControlPolicy>> = {
  task_item: { checked: (value) => typeof value === 'boolean' },
  select: { value: (value, before) => value === null || selectOptions(before).some((option) => option.id === value) },
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
    if (before.type === before.type.schema.topNodeType && key === 'arxEnvelope') {
      const a = before.attrs[key]
      const b = after.attrs[key]
      if (isRecord(a) && isRecord(b) && isRecord(a.properties) && isRecord(b.properties)) {
        const { properties: previous, ...restA } = a
        const { properties: next, ...restB } = b
        try {
          if (
            previous.type === 'properties' &&
            next.type === 'properties' &&
            JSON.stringify(restA) === JSON.stringify(restB) &&
            onlyControlValuesChanged(before.type.schema.nodeFromJSON(previous), before.type.schema.nodeFromJSON(next), policies)
          )
            continue
        } catch {
          return false
        }
      }
    }
    if (!policy || !Object.hasOwn(policy, key) || !policy[key](after.attrs[key], before)) return false
  }
  for (let i = 0; i < before.childCount; i++) {
    if (!onlyControlValuesChanged(before.child(i), after.child(i), policies)) return false
  }
  return true
}

export function selectOptions(node: Node): SelectOption[] {
  return isSelectOptionList(node.attrs.options) ? node.attrs.options : []
}

export function selectedLabel(node: Node): string | null {
  return labelOf(selectOptions(node), node.attrs.value)
}

// What a reconfiguration keeps. The form edits labels one per line, so identity has to be recovered
// from the text: a line that reads exactly like an option it had IS that option; the lines left over
// pair up with the options left over, in order (a rename); a line beyond those is a new option, an
// option beyond those is gone. The value survives exactly when the option it names does — never by
// comparing labels, which is how renaming the chosen option used to clear it.
export function reconfigureSelect(node: Node, labels: readonly string[]): { options: SelectOption[]; value: string | null } {
  const previous = selectOptions(node)
  const wanted = [...new Set(labels.map((label) => label.trim()).filter(Boolean))]
  const unmatched = new Set(previous)
  const matched = wanted.map((label) => {
    const match = previous.find((option) => unmatched.has(option) && option.label === label)
    if (match) unmatched.delete(match)
    return match ?? null
  })
  const renamed = previous.filter((option) => unmatched.has(option))
  const taken = new Set(previous.map((option) => option.id))
  const options = matched.map((match, index) => {
    if (match) return match
    const id = renamed.shift()?.id ?? newSelectOptionId(taken)
    taken.add(id)
    return { id, label: wanted[index] }
  })
  const current: unknown = node.attrs.value
  return { options, value: typeof current === 'string' && options.some((option) => option.id === current) ? current : null }
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
