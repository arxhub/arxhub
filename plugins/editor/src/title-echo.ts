import type { Node } from 'prosemirror-model'
import { AllSelection, type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

// The document's name is drawn above the body as the page's title, so a first heading that says the same
// thing would be the title twice. It is hidden as a VIEW decision only: the heading stays in the document,
// so the file, the index, export, merge and history all see exactly what is on disk.
export interface TitleEcho {
  name: string
  hidden: boolean
}

export interface TitleEchoRange {
  from: number
  to: number
}

export const titleEchoKey = new PluginKey<TitleEcho>('arx-title-echo')

export function normalizeTitle(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

// Only the first top-level block, only a level-1 heading, and only while something follows it — a
// document whose one block is the echo would leave nothing on the page to put a caret in.
export function echoesName(doc: Node, name: string): boolean {
  const first = doc.firstChild
  if (!first || doc.childCount < 2 || first.type.name !== 'heading' || first.attrs.level !== 1) return false
  const title = normalizeTitle(name)
  return title !== '' && normalizeTitle(first.textContent) === title
}

export function titleEchoRange(state: EditorState): TitleEchoRange | null {
  const echo = titleEchoKey.getState(state)
  const first = state.doc.firstChild
  return echo?.hidden && first ? { from: 0, to: first.nodeSize } : null
}

// Where a caret goes instead of into the hidden heading: the first place after it.
function afterEcho(doc: Node): Selection | null {
  const first = doc.firstChild
  return first ? Selection.findFrom(doc.resolve(first.nodeSize), 1) : null
}

export function selectionAfterEcho(doc: Node, name: string): Selection | undefined {
  return echoesName(doc, name) ? (afterEcho(doc) ?? undefined) : undefined
}

// A rename, or the "hide known extensions" switch, changes what the name reads — the one moment besides a
// load at which a shown heading may become hidden.
export function renameTitleEcho(tr: Transaction, name: string): Transaction {
  return tr.setMeta(titleEchoKey, { name }).setMeta('addToHistory', false)
}

function guardSelection(state: EditorState): Transaction | null {
  const range = titleEchoRange(state)
  const selection = state.selection
  if (!range || selection instanceof AllSelection || selection.from >= range.to) return null
  const out = afterEcho(state.doc)
  if (!out) return null
  if (selection.to <= range.to || !(selection instanceof TextSelection)) return state.tr.setSelection(out).setMeta('addToHistory', false)
  // A range reaching into the heading from below (Shift+ArrowUp) keeps its far end and loses the hidden part.
  const anchor = selection.anchor < range.to ? out.from : selection.anchor
  const head = selection.head < range.to ? out.from : selection.head
  return state.tr.setSelection(TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(head))).setMeta('addToHistory', false)
}

export function joinsIntoEcho(state: EditorState): boolean {
  const { $from, empty } = state.selection
  if (!empty || !titleEchoRange(state)) return false
  return $from.depth === 1 && $from.index(0) === 1 && $from.parentOffset === 0 && $from.parent.content.size > 0
}

export function titleEcho(name: string): Plugin<TitleEcho> {
  return new Plugin<TitleEcho>({
    key: titleEchoKey,
    state: {
      init: (_config, state) => ({ name, hidden: echoesName(state.doc, name) }),
      apply(tr, previous) {
        const renamed: { name: string } | undefined = tr.getMeta(titleEchoKey)
        if (renamed) return { name: renamed.name, hidden: echoesName(tr.doc, renamed.name) }
        // Between a load and a rename it only ever goes from hidden to shown. Hiding a heading while someone
        // edits would shift the content under the pointer, and typing a different first heading until it
        // happens to read as the name is still that person's heading — it hides when the document is next opened.
        if (previous.hidden && tr.docChanged && !echoesName(tr.doc, previous.name)) return { ...previous, hidden: false }
        return previous
      },
    },
    appendTransaction: (_trs, _old, state) => guardSelection(state),
    props: {
      // Backspace at the very start of the body would join that line into the hidden heading: the words
      // disappear into a block nobody can see, and the file's heading is rewritten. The page has nothing
      // above its first line, so the key does nothing there. An empty first line still goes (the join
      // leaves the heading's text as it was), and so does a list's or a quote's lift.
      handleKeyDown(view, event) {
        return event.key === 'Backspace' && joinsIntoEcho(view.state)
      },
      decorations(state) {
        const range = titleEchoRange(state)
        return range ? DecorationSet.create(state.doc, [Decoration.node(range.from, range.to, { class: 'arx-title-echo' })]) : null
      },
    },
  })
}
