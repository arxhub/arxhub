import { onLanguageChange } from '@arxhub/i18n'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { t } from './i18n/messages'

// CodeMirror reads its own UI words (the search panel, fold markers) from the EditorState.phrases facet,
// keyed by the English text itself.
function phraseMap(): Record<string, string> {
  return {
    Find: t('phrases.find'),
    Replace: t('phrases.replace'),
    next: t('phrases.next'),
    previous: t('phrases.previous'),
    all: t('phrases.all'),
    'match case': t('phrases.matchCase'),
    'by word': t('phrases.byWord'),
    regexp: t('phrases.regexp'),
    replace: t('phrases.replaceOne'),
    'replace all': t('phrases.replaceAll'),
    close: t('phrases.close'),
    'current match': t('phrases.currentMatch'),
    'on line': t('phrases.onLine'),
    'replaced match on line $': t('phrases.replacedMatch'),
    'replaced $ matches': t('phrases.replacedMatches'),
    'Go to line': t('phrases.goToLine'),
    go: t('phrases.go'),
    'Folded lines': t('phrases.foldedLines'),
    'Unfolded lines': t('phrases.unfoldedLines'),
    to: t('phrases.to'),
    'folded code': t('phrases.foldedCode'),
    unfold: t('phrases.unfold'),
    'Fold line': t('phrases.foldLine'),
    'Unfold line': t('phrases.unfoldLine'),
    'Control character': t('phrases.controlCharacter'),
    'Selection deleted': t('phrases.selectionDeleted'),
    Completions: t('phrases.completions'),
    Diagnostics: t('phrases.diagnostics'),
    'No diagnostics': t('phrases.noDiagnostics'),
  }
}

// One compartment per state, reconfigured on a language switch: the facet is read when a panel is built,
// so an open editor would otherwise keep speaking the language it was created in.
export interface LivePhrases {
  readonly extension: Extension
  // Keeps `view` in step with the language until the returned function is called.
  follow(view: () => EditorView | null): () => void
}

export function livePhrases(): LivePhrases {
  const compartment = new Compartment()
  return {
    extension: compartment.of(EditorState.phrases.of(phraseMap())),
    follow: (view) =>
      onLanguageChange(() => {
        view()?.dispatch({ effects: compartment.reconfigure(EditorState.phrases.of(phraseMap())) })
      }),
  }
}
