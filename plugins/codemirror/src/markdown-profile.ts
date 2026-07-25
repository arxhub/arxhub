import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown']

export function isMarkdown(path: string): boolean {
  return MARKDOWN_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))
}

// Notes are edited as markdown text, not as a document tree round-tripped through markdown. That is
// what keeps an untouched file byte-identical on save and keeps syntax we do not model from being
// dropped — the same choice Obsidian makes. The "rich" part is presentation: structure is styled
// here so the source reads as a document rather than as code.
const noteHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: '600', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: '600', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent-11)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-11)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', background: 'var(--gray-3)' },
  { tag: tags.quote, color: 'var(--gray-11)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--gray-12)' },
  // Markers stay visible but recede, so the structure reads without hiding what is really in the file.
  { tag: tags.processingInstruction, color: 'var(--gray-9)' },
])

const noteTheme = EditorView.theme({
  '&': { fontSize: 'var(--font-size-sm)' },
  '.cm-content': {
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.7',
    maxWidth: '80ch',
    padding: '1rem 0',
  },
  '.cm-line': { padding: '0 1rem' },
})

export function markdownProfile(): Extension {
  return [markdown({ base: markdownLanguage, codeLanguages: languages }), syntaxHighlighting(noteHighlight), noteTheme, EditorView.lineWrapping]
}
