import { validation } from '@arxhub/errors'
import type { Node } from 'prosemirror-model'
import { type Command, type EditorState, Plugin, Selection, type SelectionBookmark } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { editorMode } from './editor-mode'

type Mapping = Parameters<Selection['map']>[1]

export function selectedBlocks(state: Pick<EditorState, 'doc' | 'selection'>) {
  const { doc, selection } = state
  const { $from, $to } = selection
  const index = $from.index(0)
  const node = doc.maybeChild(index)
  if (!node) return null
  const from = $from.depth ? $from.before(1) : $from.pos
  const to = selection.empty ? from + node.nodeSize : $to.depth ? $to.after(1) : $to.pos
  const endIndex = doc.resolve(to).index(0)
  return { from, to, index, endIndex, count: endIndex - index, content: doc.content.cut(from, to) }
}

export class BlockSelection extends Selection {
  override visible = false

  static create(doc: Node, from: number, to: number): BlockSelection {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    if ($from.depth || $to.depth || from >= to) throw validation('Block selection must cover complete document blocks')
    return new BlockSelection($from, $to)
  }

  override eq(other: Selection): boolean {
    return other instanceof BlockSelection && other.from === this.from && other.to === this.to
  }

  override map(doc: Node, mapping: Mapping): Selection {
    return this.getBookmark().map(mapping).resolve(doc)
  }

  override toJSON() {
    return { type: 'arx-blocks', from: this.from, to: this.to }
  }

  static override fromJSON(doc: Node, value: { from: number; to: number }): BlockSelection {
    return BlockSelection.create(doc, value.from, value.to)
  }

  override getBookmark(): SelectionBookmark {
    return new BlockBookmark(this.from, this.to)
  }
}

class BlockBookmark implements SelectionBookmark {
  constructor(
    readonly from: number,
    readonly to: number,
  ) {}

  map(mapping: Mapping): BlockBookmark {
    return new BlockBookmark(mapping.map(this.from, 1), mapping.map(this.to, -1))
  }

  resolve(doc: Node): Selection {
    const from = Math.min(this.from, doc.content.size)
    const to = Math.min(this.to, doc.content.size)
    if (from < to && doc.resolve(from).depth === 0 && doc.resolve(to).depth === 0) return BlockSelection.create(doc, from, to)
    return Selection.near(doc.resolve(Math.max(0, from)))
  }
}

Selection.jsonID('arx-blocks', BlockSelection)

export const selectBlocks =
  (extend: 'current' | 'next' | 'previous' | 'all'): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    let { from, to } = range
    if (extend === 'next') {
      const next = state.doc.maybeChild(range.endIndex)
      if (!next) return false
      to += next.nodeSize
    } else if (extend === 'previous') {
      if (!range.index) return false
      from -= state.doc.child(range.index - 1).nodeSize
    } else if (extend === 'all') {
      from = 0
      to = state.doc.content.size
    }
    dispatch?.(state.tr.setSelection(BlockSelection.create(state.doc, from, to)))
    return true
  }

export function blockSelectionPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        if (!(state.selection instanceof BlockSelection)) return null
        const decorations: Decoration[] = []
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'arx-block-selected' }))
          return false
        })
        return DecorationSet.create(state.doc, decorations)
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape' || !(view.state.selection instanceof BlockSelection)) return false
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.selection.$from)))
        return true
      },
    },
  })
}
