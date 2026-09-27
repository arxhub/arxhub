import { readText, type Text } from '@arxhub/i18n'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { editorMode } from './editor-mode'
import { t } from './i18n/messages'

// Read on every decoration pass, so the hint follows a language switch at the next transaction.
export const INSERT_HINT: Text = () => t('hint.insert')

// The hint follows the caret rather than the document: it used to be a stylesheet rule on a document
// that was one empty paragraph and nothing else, so the moment a note had any text the one place `/`
// works from — an empty paragraph — stopped saying so. A node decoration puts the text on whichever
// empty paragraph holds the caret while the editor is editable; the stylesheet draws `data-placeholder`
// and knows nothing about modes or selections.
export function insertHint(hint: Text = INSERT_HINT): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        const { $from, empty } = state.selection
        if (!empty || editorMode(state) !== 'editable') return null
        if ($from.parent.type !== state.schema.nodes.paragraph || $from.parent.content.size !== 0) return null
        const text = readText(hint)
        return DecorationSet.create(state.doc, [
          Decoration.node($from.before(), $from.after(), { 'data-placeholder': text }, { placeholder: text }),
        ])
      },
    },
  })
}
