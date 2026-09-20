import { closeHistory } from 'prosemirror-history'
import type { Node, ResolvedPos } from 'prosemirror-model'
import { type Command, type EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { TableMap } from 'prosemirror-tables'
import { BlockSelection } from './block-selection'
import { editorMode } from './editor-mode'

interface ExitTarget {
  node: Node
  end: number
  depth: number
}

function exitTarget(state: EditorState): ExitTarget | null {
  const { selection } = state
  if (selection instanceof BlockSelection) {
    const node = state.doc.nodeAt(selection.from)
    return node ? { node, end: selection.to, depth: 0 } : null
  }
  if (selection instanceof NodeSelection && selection.node.isBlock)
    return { node: selection.node, end: selection.to, depth: selection.$from.depth }
  const { $from, to } = selection
  let text: ExitTarget | null = null
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    // Rows, cells, list items and individual columns are structural children, not exit destinations.
    if (!node.type.isInGroup('block') || to > $from.after(depth)) continue
    const target = { node, end: $from.after(depth), depth }
    if (!node.isTextblock || node.type.spec.code) return target
    text ??= target
  }
  return text
}

function continueAt(state: EditorState, end: number, dispatch: Parameters<Command>[1]): boolean {
  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return false
  const $end = state.doc.resolve(end)
  const reuse = $end.nodeAfter?.type === paragraph
  if (!reuse && !$end.parent.canReplaceWith($end.index(), $end.index(), paragraph)) return false
  if (dispatch) {
    const tr = state.tr
    if (!reuse) tr.insert(end, paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, end + 1)).setStoredMarks(null)
    dispatch((reuse ? tr : closeHistory(tr)).scrollIntoView())
  }
  return true
}

export const continueAfterBlock: Command = (state, dispatch) => {
  if (editorMode(state) !== 'editable') return false
  const target = exitTarget(state)
  return target !== null && continueAt(state, target.end, dispatch)
}

function atContainerBottom($from: ResolvedPos, target: ExitTarget): boolean {
  let tableDepth = -1
  for (let depth = $from.depth; depth > target.depth; depth--) {
    const parent = $from.node(depth - 1)
    if (parent.type.spec.tableRole === 'row') {
      tableDepth = depth - 2
      const map = TableMap.get($from.node(tableDepth))
      const cell = $from.before(depth) - $from.start(tableDepth)
      // A bottom-row cell can have columns to its right, or span rows below its origin.
      if (map.findCell(cell).bottom !== map.height) return false
    } else if (depth - 1 !== tableDepth && $from.index(depth - 1) !== parent.childCount - 1) return false
  }
  return true
}

export const exitBlockDown: Command = (state, dispatch, view) => {
  if (editorMode(state) !== 'editable') return false
  const { selection } = state
  const target = exitTarget(state)
  if (!target) return false
  if (selection instanceof TextSelection) {
    if (!selection.empty || !view?.endOfTextblock('down') || !atContainerBottom(selection.$from, target)) return false
    // Down in an ordinary paragraph stays native, including at the end of a document.
    if (target.node.type === state.schema.nodes.paragraph) return false
  } else if (!(selection instanceof NodeSelection)) return false
  const next = state.doc.resolve(target.end).nodeAfter
  if (next && next.type !== state.schema.nodes.paragraph) return false
  return continueAt(state, target.end, dispatch)
}
