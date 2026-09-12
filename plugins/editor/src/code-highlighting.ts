import type { LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { classHighlighter, highlightTree } from '@lezer/highlight'
import type { Node } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export const CODE_LANGUAGES = languages.map((language) => language.name).sort()
export const MAX_HIGHLIGHT_LENGTH = 100_000
const loaded = new Map<string, LanguageSupport | null>()
const loading = new Map<string, Promise<void>>()
const key = new PluginKey('code-highlighting')
const tokens = new WeakMap<Node, { from: number; to: number; className: string }[]>()

function loadLanguage(name: string): Promise<void> {
  if (loaded.has(name)) return Promise.resolve()
  let pending = loading.get(name)
  if (!pending) {
    const language = languages.find((item) => item.name === name || item.alias.includes(name.toLowerCase()))
    pending = (language?.load() ?? Promise.resolve(null)).then(
      (support) => {
        loaded.set(name, support)
      },
      () => {
        loaded.set(name, null)
      },
    )
    loading.set(name, pending)
  }
  return pending
}

export function codeHighlighting(): Plugin {
  return new Plugin({
    key,
    view: (view) => {
      let active = true
      const requested = new Set<string>()
      function update() {
        view.state.doc.descendants((node) => {
          const name: string = node.attrs.language ?? ''
          if (node.type.name === 'code_block' && name && !loaded.has(name) && !requested.has(name)) {
            requested.add(name)
            loadLanguage(name).then(() => {
              if (active && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true))
            })
          }
        })
      }
      update()
      return {
        update,
        destroy: () => {
          active = false
        },
      }
    },
    props: {
      decorations: (state) => {
        const decorations: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'code_block') return true
          if (node.content.size > MAX_HIGHLIGHT_LENGTH) return false
          const support = loaded.get(node.attrs.language)
          if (!support) return false
          let spans = tokens.get(node)
          if (!spans) {
            spans = []
            const output = spans
            highlightTree(support.language.parser.parse(node.textContent), classHighlighter, (from, to, className) =>
              output.push({ from, to, className }),
            )
            tokens.set(node, spans)
          }
          for (const span of spans) decorations.push(Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.className }))
          return false
        })
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}
