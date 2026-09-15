import { Fragment, type Node, type ResolvedPos } from 'prosemirror-model'
import type { Transaction } from 'prosemirror-state'

// Where blocks typed over the caret's paragraph go: in place of that paragraph while it is empty and its
// parent allows the blocks there (`doc`, a blockquote), after it otherwise. "Otherwise" covers a
// paragraph that still has text — kept, the block follows it — and the first child of a task or list
// item, which the schema says must stay a paragraph (`paragraph block*`): replacing it wholesale used to
// hand the fitter an invalid tree to reshape, and a caret offset computed for the shape that was asked
// for then landed outside any textblock. Returns where the blocks start, or null when the parent takes
// them in neither place, so the command can refuse instead of writing something the schema would bend.
export function placeBlocks(tr: Transaction, $from: ResolvedPos, blocks: readonly Node[]): number | null {
  const fragment = Fragment.from(blocks)
  const parent = $from.node(-1)
  const index = $from.index(-1)
  if ($from.parent.content.size === 0 && parent.canReplace(index, index + 1, fragment)) {
    tr.replaceWith($from.before(), $from.after(), fragment)
    return $from.before()
  }
  if (parent.canReplace(index + 1, index + 1, fragment)) {
    tr.insert($from.after(), fragment)
    return $from.after()
  }
  return null
}
