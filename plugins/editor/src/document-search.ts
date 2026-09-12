import { closeHistory } from 'prosemirror-history'
import type { Node } from 'prosemirror-model'
import { type Command, Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { editorMode } from './editor-mode'

export interface DocumentMatch {
  from: number
  to: number
}
export interface DocumentSearch {
  query: string
  matchCase: boolean
  matches: DocumentMatch[]
  index: number
}
export const documentSearchKey = new PluginKey<DocumentSearch>('document-search')

export function findDocumentMatches(doc: Node, query: string, matchCase = false): DocumentMatch[] {
  if (!query) return []
  const matches: DocumentMatch[] = []
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu')
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, '\ufffc')
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length })
    return false
  })
  return matches
}

export function documentSearchPlugin(open: () => void): Plugin<DocumentSearch> {
  return new Plugin<DocumentSearch>({
    key: documentSearchKey,
    state: {
      init: () => ({ query: '', matchCase: false, matches: [], index: 0 }),
      apply: (tr, previous) => {
        const change: Partial<Pick<DocumentSearch, 'query' | 'matchCase' | 'index'>> | undefined = tr.getMeta(documentSearchKey)
        if (!change && !tr.docChanged) return previous
        const query = change?.query ?? previous.query
        const matchCase = change?.matchCase ?? previous.matchCase
        const matches =
          tr.docChanged || query !== previous.query || matchCase !== previous.matchCase
            ? findDocumentMatches(tr.doc, query, matchCase)
            : previous.matches
        const index = matches.length ? Math.max(0, Math.min(change?.index ?? previous.index, matches.length - 1)) : 0
        return { query, matchCase, matches, index }
      },
    },
    props: {
      decorations: (state) => {
        const search = documentSearchKey.getState(state)
        return search?.matches.length
          ? DecorationSet.create(
              state.doc,
              search.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class: index === search.index ? 'arx-find-match arx-find-current' : 'arx-find-match',
                }),
              ),
            )
          : null
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyF') {
            event.preventDefault()
            open()
            return true
          }
          return false
        },
      },
    },
  })
}

export function revealDocumentMatch(view: EditorView, direction = 0): void {
  const search = documentSearchKey.getState(view.state)
  if (!search?.matches.length) return
  const index = (search.index + direction + search.matches.length) % search.matches.length
  const match = search.matches[index]
  view.dispatch(
    view.state.tr
      .setMeta(documentSearchKey, { index })
      .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
      .scrollIntoView(),
  )
}

export const replaceDocumentMatch =
  (replacement: string, all = false): Command =>
  (state, dispatch) => {
    const search = documentSearchKey.getState(state)
    if (!search?.matches.length || editorMode(state) !== 'editable') return false
    if (dispatch) {
      const tr = state.tr
      const matches = all ? search.matches : [search.matches[search.index]]
      for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to)
      const next = findDocumentMatches(tr.doc, search.query, search.matchCase)
      const index = all
        ? 0
        : Math.max(
            0,
            next.findIndex((match) => match.from >= matches[0].from + replacement.length),
          )
      dispatch(closeHistory(tr).setMeta(documentSearchKey, { index }))
    }
    return true
  }

export function documentHeadings(doc: Node): { pos: number; level: number; title: string }[] {
  const headings: { pos: number; level: number; title: string }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') headings.push({ pos: pos + 1, level: node.attrs.level, title: node.textContent || 'Untitled heading' })
    return !node.isTextblock
  })
  return headings
}
