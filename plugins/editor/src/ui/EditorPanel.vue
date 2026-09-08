<script setup lang="ts">
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
import { Button } from '@arxhub/uikit/core'
import { toaster, useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { history } from 'prosemirror-history'
import { inputRules } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { onUnmounted, ref, shallowRef, toRef } from 'vue'
import { deserialize, emptyDoc, serialize } from '../editor-format'
import { buildInputRules } from '../editor-input-rules'
import { buildKeymap } from '../editor-keymap'
import { schema } from '../editor-schema'
import EditorToolbar from './EditorToolbar.vue'
import 'prosemirror-view/style/prosemirror.css'

// Fires this long after the last keystroke, mirroring the search plugin's index-queue debounce shape
// (a burst of edits coalesces into one write, not one per keystroke).
const AUTOSAVE_DEBOUNCE_MS = 1500

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const vfs = arxhub.services.get(VaultVfs)
const editorEl = ref<HTMLDivElement>()
const view = shallowRef<EditorView | null>(null)

function buildPlugins() {
  return [history(), keymap(buildKeymap(schema)), inputRules({ rules: buildInputRules(schema) })]
}

function buildState(_path: string, bytes: Uint8Array): EditorState {
  // Only a genuinely-empty file opens an empty document. Anything else is decoded and deserialized
  // as-is — a failure here (corrupt JSON, an incompatible schema) is left to propagate so the shared
  // load hook can route it through the same error path as a read failure, rather than silently
  // substituting an empty document a Save could flush over the original bytes.
  if (bytes.length === 0) return EditorState.create({ schema, doc: emptyDoc(schema), plugins: buildPlugins() })
  const doc = deserialize(schema, new TextDecoder().decode(bytes))
  return EditorState.create({ schema, doc, plugins: buildPlugins() })
}

// Shared composable owns the load lifecycle: staleness guard on rapid file switches, open-empty
// only on a genuine FileNotFound, and canSave gating so a failed/in-flight read can't be saved over.
const {
  error: loadError,
  canSave,
  reload,
} = useFileDocument<EditorState>(toRef(props, 'path'), {
  read: (path) => vfs.read(path),
  build: (path, bytes) => buildState(path, bytes),
  apply: (_path, state) => {
    if (view.value) {
      view.value.updateState(state)
    } else if (editorEl.value) {
      view.value = new EditorView(editorEl.value, {
        state,
        dispatchTransaction(tr) {
          if (!view.value) return
          view.value.updateState(view.value.state.apply(tr))
          if (tr.docChanged) {
            // Never autosave over a load that hasn't (or can no longer) resolve — `doSave` re-checks
            // canSave at fire time too, but there is no point arming a timer for a run that can only
            // no-op.
            if (canSave.value) autosave.schedule()
          }
        },
      })
    }
  },
})

async function doSave() {
  if (!view.value || !canSave.value) return
  const content = serialize(view.value.state.doc)
  try {
    await vfs.write(props.path, new TextEncoder().encode(content))
  } catch (error) {
    // Don't swallow a failed write — that silently loses the user's edits. Surface it loudly.
    arxhub.logger.error(`[editor] failed to save ${props.path}:`, error)
    toaster.create({ title: 'Save failed', description: `Couldn't save ${props.path}`, type: 'error' })
    throw error
  }
}

// One write path for both the explicit Save (button / Ctrl+S) and autosave: the explicit path flushes
// the debounce immediately (joining an in-flight autosave rather than racing it with a second write),
// autosave schedules it AUTOSAVE_DEBOUNCE_MS after the last edit.
const autosave = createDebouncedTask({ run: doSave, debounceMs: AUTOSAVE_DEBOUNCE_MS })

async function save() {
  await autosave.flush()
}

onUnmounted(() => {
  autosave.cancel()
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="editor-panel" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <EditorToolbar :view="view" :on-save="save" :can-save="canSave" />
    <div v-if="loadError" class="editor-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <Button size="sm" variant="secondary" @click="reload(path)">Retry</Button>
    </div>
    <div v-show="!loadError" ref="editorEl" class="editor-content" />
  </div>
</template>

<style scoped>
.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 48px;
  box-sizing: border-box;
}
.editor-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--danger-11);
  background: var(--danger-2);
  border-bottom: 1px solid var(--danger-6);
}
.editor-content :deep(.ProseMirror) {
  outline: none;
  min-height: 200px;
  font-size: var(--font-size-md);
  line-height: 1.7;
  color: var(--gray-12);
}
/* design-ignore DS type ramp: this is the CONTENT of a note, not chrome. A heading inside a document
   scales with the body it sits in, so these are relative to --font-size-md rather than steps of the
   chrome ramp — the ramp has no note-heading step and should not grow one. */
.editor-content :deep(h1) { font-size: 2em; font-weight: 700; margin: 0.67em 0; }
.editor-content :deep(h2) { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; }
.editor-content :deep(h3) { font-size: 1.17em; font-weight: 600; margin: 0.83em 0; }
.editor-content :deep(p) { margin: 0.4em 0; }
.editor-content :deep(ul), .editor-content :deep(ol) { padding-left: 1.75em; margin: 0.4em 0; }
.editor-content :deep(blockquote) {
  border-left: 3px solid var(--gray-6);
  padding-left: 1em;
  color: var(--gray-10);
  margin: 0.5em 0;
}
.editor-content :deep(code) {
  background: var(--gray-3);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-family: var(--font-mono, monospace);
  /* design-ignore DS type ramp: inline code inside note content, relative to the note body. */
  font-size: 0.875em;
}
.editor-content :deep(pre) {
  background: var(--gray-2);
  border: 1px solid var(--gray-4);
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}
/* design-ignore DS type ramp: code block inside note content, relative to the note body. */
.editor-content :deep(pre code) { background: none; padding: 0; border-radius: 0; font-size: 0.9em; }
.editor-content :deep(hr) { border: none; border-top: 1px solid var(--gray-5); margin: 1.5em 0; }
.editor-content :deep(ul[data-type="task_list"]) { list-style: none; padding-left: 0.25em; }
.editor-content :deep(li[data-type="task_item"]) { display: flex; align-items: baseline; gap: 0.5em; margin: 0.15em 0; }
.editor-content :deep(li[data-checked="true"]) { color: var(--gray-9); text-decoration: line-through; }
.editor-content :deep(.callout) {
  border-left: 4px solid var(--gray-6);
  padding: 0.75em 1em;
  border-radius: 0 6px 6px 0;
  margin: 0.75em 0;
  background: var(--gray-2);
}
/* The semantic aliases, not the raw scales they happen to resolve to: a theme remaps info/warning/
   danger/success, and naming blue/yellow/red/green here would opt a callout out of that. */
.editor-content :deep(.callout[data-type="info"]) { border-color: var(--info-8); background: var(--info-2); }
.editor-content :deep(.callout[data-type="warning"]) { border-color: var(--warning-8); background: var(--warning-2); }
.editor-content :deep(.callout[data-type="danger"]) { border-color: var(--danger-8); background: var(--danger-2); }
.editor-content :deep(.callout[data-type="success"]) { border-color: var(--success-8); background: var(--success-2); }
.editor-content :deep(s) { text-decoration: line-through; }
.editor-content :deep(u) { text-decoration: underline; }
.editor-content :deep(mark) { background: var(--warning-4); border-radius: var(--radius-xs); padding: 0 2px; }
/* A link is the second of the two things the accent is spent on, and accent text is step 11. */
.editor-content :deep(a) { color: var(--accent-11); text-decoration: underline; cursor: pointer; }
</style>
