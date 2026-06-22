<script setup lang="ts">
import { usePanelInstance } from '@arxhub/plugin-panels/ui'
import { useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
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

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const vfs = arxhub.services.get(VaultVfs)
const panel = usePanelInstance()
const editorEl = ref<HTMLDivElement>()
const view = shallowRef<EditorView | null>(null)

function buildPlugins() {
  return [history(), keymap(buildKeymap(schema)), inputRules({ rules: buildInputRules(schema) })]
}

function buildState(_path: string, bytes: Uint8Array): EditorState {
  if (bytes.length === 0) return EditorState.create({ schema, doc: emptyDoc(schema), plugins: buildPlugins() })
  try {
    const doc = deserialize(schema, new TextDecoder().decode(bytes))
    return EditorState.create({ schema, doc, plugins: buildPlugins() })
  } catch {
    // Malformed content (not a read failure) → open an empty doc rather than crashing the panel.
    return EditorState.create({ schema, doc: emptyDoc(schema), plugins: buildPlugins() })
  }
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
          // First real edit promotes a VSCode-style preview tab to a permanent one (no-op otherwise)
          if (tr.docChanged) panel?.promote()
        },
      })
    }
  },
})

async function save() {
  if (!view.value || !canSave.value) return
  const content = serialize(view.value.state.doc)
  try {
    await vfs.write(props.path, new TextEncoder().encode(content))
  } catch (error) {
    // Don't swallow a failed write — that silently loses the user's edits. Surface it loudly.
    // TODO: replace with a user-visible toast once a <Toaster> is mounted in the shell.
    arxhub.logger.error(`[editor] failed to save ${props.path}:`, error)
    throw error
  }
}

onUnmounted(() => {
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="editor-panel" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <EditorToolbar :view="view" :on-save="save" />
    <div v-if="loadError" class="editor-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <button class="editor-error-retry" @click="reload(path)">Retry</button>
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
  font-size: 13px;
  color: var(--red-11);
  background: var(--red-2);
  border-bottom: 1px solid var(--red-6);
}
.editor-error-retry {
  border: 1px solid var(--red-6);
  border-radius: 4px;
  background: var(--red-3);
  color: var(--red-11);
  padding: 2px 10px;
  cursor: pointer;
}
.editor-content :deep(.ProseMirror) {
  outline: none;
  min-height: 200px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--gray-12);
}
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
.editor-content :deep(.callout[data-type="info"]) { border-color: var(--blue-8, #3b82f6); background: var(--blue-2, #eff6ff); }
.editor-content :deep(.callout[data-type="warning"]) { border-color: var(--yellow-8, #f59e0b); background: var(--yellow-2, #fffbeb); }
.editor-content :deep(.callout[data-type="danger"]) { border-color: var(--red-8, #ef4444); background: var(--red-2, #fef2f2); }
.editor-content :deep(.callout[data-type="success"]) { border-color: var(--green-8, #10b981); background: var(--green-2, #f0fdf4); }
.editor-content :deep(s) { text-decoration: line-through; }
.editor-content :deep(u) { text-decoration: underline; }
.editor-content :deep(mark) { background: var(--yellow-4, #fef08a); border-radius: 2px; padding: 0 2px; }
.editor-content :deep(a) { color: var(--blue-9, #2563eb); text-decoration: underline; cursor: pointer; }
</style>
