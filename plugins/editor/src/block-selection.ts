import { validation } from '@arxhub/errors'
import { Fragment, type Node, Slice } from 'prosemirror-model'
import { type Command, type EditorState, NodeSelection, Plugin, Selection, type SelectionBookmark, SelectionRange } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { editorMode } from './editor-mode'

type Mapping = Parameters<Selection['map']>[1]

export function selectedBlocks(state: Pick<EditorState, 'doc' | 'selection'>) {
  const { doc, selection } = state
  const { $from, $to } = selection
  let depth = 0
  let from = selection.from
  let to = selection.to
  if (selection instanceof BlockSelection || (selection instanceof NodeSelection && selection.node.isBlock)) {
    depth = $from.depth
  } else {
    const shared = $from.sharedDepth(to)
    let blockDepth = Math.min($from.depth, shared + 1)
    for (; blockDepth > 0; blockDepth--) {
      const node = $from.node(blockDepth)
      const parent = $from.node(blockDepth - 1)
      if (node.type.isInGroup('block') && !['list_item', 'task_item'].includes(parent.type.name)) break
    }
    depth = Math.max(0, blockDepth - 1)
    from = $from.depth > depth ? $from.before(depth + 1) : $from.pos
    to = selection.empty ? from + (doc.nodeAt(from)?.nodeSize ?? 0) : $to.depth > depth ? $to.after(depth + 1) : $to.pos
  }
  if (!validSpan(doc, from, to)) return null
  const parent = doc.resolve(from).parent
  const start = doc.resolve(from).start(depth)
  const index = doc.resolve(from).index(depth)
  const endIndex = doc.resolve(to).index(depth)
  const spans =
    selection instanceof BlockSelection ? selection.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos })) : [{ from, to }]
  return {
    from,
    to,
    index,
    endIndex,
    parent,
    depth,
    start,
    spans,
    count: spans.reduce((count, span) => count + doc.resolve(span.to).index(depth) - doc.resolve(span.from).index(depth), 0),
    content: selection instanceof BlockSelection ? selection.content().content : doc.slice(from, to).content,
  }
}

function validSpan(doc: Node, from: number, to: number): boolean {
  if (from < 0 || from >= to || to > doc.content.size) return false
  const a = doc.resolve(from)
  const b = doc.resolve(to)
  return a.sameParent(b) && !a.textOffset && !b.textOffset && !!a.nodeAfter?.isBlock && !a.parent.isTextblock
}

export class BlockSelection extends Selection {
  override visible = false

  override get $to() {
    return this.ranges[this.ranges.length - 1].$to
  }

  static fromSpans(doc: Node, spans: readonly { from: number; to: number }[]): BlockSelection {
    const merged: { from: number; to: number }[] = []
    for (const span of [...spans].sort((a, b) => a.from - b.from)) {
      if (!validSpan(doc, span.from, span.to) || (merged.length && !doc.resolve(merged[0].from).sameParent(doc.resolve(span.from))))
        throw validation('Block selection must cover sibling blocks')
      const last = merged[merged.length - 1]
      if (last && span.from <= last.to) last.to = Math.max(last.to, span.to)
      else merged.push({ ...span })
    }
    if (!merged.length) throw validation('Block selection cannot be empty')
    return new BlockSelection(
      doc.resolve(merged[0].from),
      doc.resolve(merged[merged.length - 1].to),
      merged.map((span) => new SelectionRange(doc.resolve(span.from), doc.resolve(span.to))),
    )
  }

  override content(): Slice {
    let content = Fragment.empty
    for (const range of this.ranges) content = content.append(range.$from.doc.slice(range.$from.pos, range.$to.pos).content)
    return new Slice(content, 0, 0)
  }

  static create(doc: Node, from: number, to: number): BlockSelection {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    if (!validSpan(doc, from, to)) throw validation('Block selection must cover sibling blocks')
    return new BlockSelection($from, $to)
  }

  override eq(other: Selection): boolean {
    return (
      other instanceof BlockSelection &&
      other.ranges.length === this.ranges.length &&
      other.ranges.every((range, i) => range.$from.pos === this.ranges[i].$from.pos && range.$to.pos === this.ranges[i].$to.pos)
    )
  }

  override map(doc: Node, mapping: Mapping): Selection {
    return this.getBookmark().map(mapping).resolve(doc)
  }

  override toJSON() {
    return {
      type: 'arx-blocks',
      from: this.from,
      to: this.to,
      ...(this.ranges.length > 1 ? { spans: this.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos })) } : {}),
    }
  }

  static override fromJSON(doc: Node, value: { from: number; to: number; spans?: { from: number; to: number }[] }): BlockSelection {
    return value.spans ? BlockSelection.fromSpans(doc, value.spans) : BlockSelection.create(doc, value.from, value.to)
  }

  override getBookmark(): SelectionBookmark {
    return new BlockBookmark(this.ranges.map((range) => ({ from: range.$from.pos, to: range.$to.pos })))
  }
}

class BlockBookmark implements SelectionBookmark {
  constructor(readonly spans: readonly { from: number; to: number }[]) {}
  map(mapping: Mapping): BlockBookmark {
    return new BlockBookmark(this.spans.map((span) => ({ from: mapping.map(span.from, 1), to: mapping.map(span.to, -1) })))
  }
  resolve(doc: Node): Selection {
    const spans = this.spans.filter(
      (span) => span.from >= 0 && span.from < span.to && span.to <= doc.content.size && validSpan(doc, span.from, span.to),
    )
    const siblings = spans.filter((span) => doc.resolve(spans[0].from).sameParent(doc.resolve(span.from)))
    return siblings.length
      ? BlockSelection.fromSpans(doc, siblings)
      : Selection.near(doc.resolve(Math.max(0, Math.min(this.spans[0]?.from ?? 0, doc.content.size))))
  }
}

Selection.jsonID('arx-blocks', BlockSelection)

export const selectBlocks =
  (extend: 'current' | 'next' | 'previous' | 'all' | 'parent'): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    let { from, to } = range
    if (extend === 'next') {
      const next = range.parent.maybeChild(range.endIndex)
      if (!next) return false
      to += next.nodeSize
    } else if (extend === 'previous') {
      if (!range.index) return false
      from -= range.parent.child(range.index - 1).nodeSize
    } else if (extend === 'parent') {
      const pos = state.doc.resolve(from)
      let depth = range.depth
      while (depth > 0 && !pos.node(depth).type.isInGroup('block')) depth--
      if (!depth) return false
      from = pos.before(depth)
      to = pos.after(depth)
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
      handleDOMEvents: {
        mousedown(view, event) {
          if (editorMode(view.state) !== 'editable' || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false
          if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [role="button"], [role="checkbox"]'))
            return false
          const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!hit) return false
          const resolved = view.state.doc.resolve(hit.pos)
          const selected = selectedBlocks({ doc: view.state.doc, selection: Selection.near(resolved) })
          if (!selected) return false
          const from = selected.from
          const node = view.state.doc.nodeAt(from)
          if (!node) return false
          const spans: { from: number; to: number }[] = []
          let included = false
          if (view.state.selection instanceof BlockSelection && view.state.selection.$from.sameParent(view.state.doc.resolve(from))) {
            for (const range of view.state.selection.ranges)
              view.state.doc.nodesBetween(range.$from.pos, range.$to.pos, (block, pos) => {
                if (pos < range.$from.pos) return true
                if (pos === from) included = true
                else spans.push({ from: pos, to: pos + block.nodeSize })
                return false
              })
          }
          if (!included) spans.push({ from, to: from + node.nodeSize })
          view.dispatch(view.state.tr.setSelection(spans.length ? BlockSelection.fromSpans(view.state.doc, spans) : Selection.near(resolved)))
          view.focus()
          event.preventDefault()
          return true
        },
      },
      decorations: (state) => {
        if (!(state.selection instanceof BlockSelection)) return null
        const decorations: Decoration[] = []
        for (const range of state.selection.ranges)
          state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
            if (pos < range.$from.pos) return true
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
