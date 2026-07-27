<script setup lang="ts">
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, type Extension, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { editorTheme } from '../editor-theme'

// A code editor over a plain string — no file, no panel, no save. The file-backed editor next to it owns
// a document's lifecycle; this one is the control another surface embeds (the SQL console is the first),
// so every plugin that needs a text area with syntax on it gets the same editor instead of its own.
const props = withDefaults(
  defineProps<{
    modelValue: string
    // A language name as @codemirror/language-data spells it ('sql', 'json', …). The grammar is loaded
    // lazily, so a name nothing matches simply leaves the editor unhighlighted.
    language?: string
    placeholder?: string
    ariaLabel?: string
    readonly?: boolean
    // Fired on the modifier + Enter chord, which is what "run this" means in a console.
    submitOnModEnter?: boolean
  }>(),
  { submitOnModEnter: false, readonly: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>()

const editorEl = ref<HTMLDivElement>()
// shallowRef: the view is a live object graph, not reactive data, and making it deeply reactive would
// have Vue walk CodeMirror's internals on every keystroke.
const view = shallowRef<EditorView | null>(null)

function submit(): boolean {
  emit('submit')
  return true
}

async function extensions(): Promise<Extension[]> {
  const description = props.language == null ? null : LanguageDescription.matchLanguageName(languages, props.language, true)
  const support = description == null ? null : await description.load()
  return [
    // Prec.highest, not just "first in the array": the default keymap inside basicSetup already binds
    // Mod-Enter (to insertBlankLine), and without an explicit precedence it wins — the chord then quietly
    // adds a line instead of running the query.
    ...(props.submitOnModEnter ? [Prec.highest(keymap.of([{ key: 'Mod-Enter', run: submit }]))] : []),
    basicSetup,
    editorTheme(),
    ...(support == null ? [] : [support]),
    ...(props.placeholder == null ? [] : [placeholderExtension(props.placeholder)]),
    ...(props.readonly ? [EditorState.readOnly.of(true)] : []),
    EditorView.lineWrapping,
    // Only a real edit travels back out: a programmatic setState reports docChanged with no transaction
    // behind it, and echoing that would fight the parent for the value.
    EditorView.updateListener.of((update) => {
      if (update.docChanged && update.transactions.length > 0) emit('update:modelValue', update.state.doc.toString())
    }),
  ]
}

onMounted(async () => {
  const state = EditorState.create({ doc: props.modelValue, extensions: await extensions() })
  if (editorEl.value == null) return
  view.value = new EditorView({ state, parent: editorEl.value })
})

// The parent may replace the text wholesale (restoring a saved query, dropping an example in). Compared
// against what the editor already holds, so a keystroke that came from here does not bounce back.
watch(
  () => props.modelValue,
  (next) => {
    const current = view.value
    if (current == null || current.state.doc.toString() === next) return
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: next } })
  },
)

onUnmounted(() => {
  view.value?.destroy()
  view.value = null
})

// Focus and the current text, for a parent that drives the editor from a button rather than the keyboard.
defineExpose({
  focus: (): void => view.value?.focus(),
  text: (): string => view.value?.state.doc.toString() ?? props.modelValue,
})
</script>

<template>
  <div ref="editorEl" class="code-editor" :aria-label="ariaLabel" />
</template>

<style scoped>
.code-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
}

.code-editor :deep(.cm-editor) {
  height: 100%;
  font-size: var(--font-size-sm);
}

.code-editor :deep(.cm-editor.cm-focused) {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.code-editor :deep(.cm-scroller) {
  overflow: auto;
  font-family: var(--font-mono);
}
</style>
