import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, ref, watch } from 'vue'
import { documentSearchKey, replaceDocumentMatch, revealDocumentMatch } from '../document-search'
import type { EditorMode } from '../editor-mode'

export interface DocumentFindProps {
  view: EditorView
  revision: number
  mode: EditorMode
}

export function useDocumentFind(props: DocumentFindProps) {
  const root = ref<HTMLElement>()
  const query = ref(documentSearchKey.getState(props.view.state)?.query ?? '')
  const matchCase = ref(documentSearchKey.getState(props.view.state)?.matchCase ?? false)
  const replacement = ref('')
  const search = computed(() => {
    void props.revision
    return documentSearchKey.getState(props.view.state)
  })
  watch(
    [query, matchCase],
    () => {
      props.view.dispatch(props.view.state.tr.setMeta(documentSearchKey, { query: query.value, matchCase: matchCase.value, index: 0 }))
      revealDocumentMatch(props.view)
    },
    { immediate: true },
  )
  onMounted(() => root.value?.querySelector('input')?.focus())

  function replace(all = false) {
    replaceDocumentMatch(replacement.value, all)(props.view.state, props.view.dispatch)
    revealDocumentMatch(props.view)
  }

  return { root, query, matchCase, replacement, search, replace }
}
