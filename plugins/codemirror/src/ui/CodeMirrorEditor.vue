<script setup lang="ts">
import { usePanelInstance } from '@arxhub/plugin-panels/ui'
import { toaster, useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { basicSetup, EditorView } from 'codemirror'
import { computed, onUnmounted, ref, shallowRef, toRef } from 'vue'
import { insertLink, toggleBold, toggleInlineCode, toggleItalic } from '../markdown-commands'
import { isMarkdown, markdownProfile } from '../markdown-profile'
import MarkdownToolbar from './MarkdownToolbar.vue'

const props = defineProps<{ path: string }>()

const markdownKeymap = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-e', run: toggleInlineCode },
  { key: 'Mod-k', run: insertLink },
]

const arxhub = useArxHub()
const vfs = arxhub.services.get(VaultVfs)
const panel = usePanelInstance()
const editorEl = ref<HTMLDivElement>()
// shallowRef so the markdown toolbar can reach the live view; the view is not reactive data.
const view = shallowRef<EditorView | null>(null)
const note = computed(() => isMarkdown(props.path))

async function buildState(path: string, bytes: Uint8Array): Promise<EditorState> {
  const doc = new TextDecoder().decode(bytes)
  // Markdown gets the note profile — the document-like presentation and formatting keys — instead of
  // the plain code-editor language support. Everything else stays a code file.
  const note = isMarkdown(path)
  const langDesc = note ? null : LanguageDescription.matchFilename(languages, path)
  const langSupport = langDesc ? await langDesc.load() : null
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      ...(note ? [markdownProfile(), keymap.of(markdownKeymap)] : []),
      ...(langSupport ? [langSupport] : []),
      // First real edit promotes a VSCode-style preview tab to permanent (mirrors the ProseMirror
      // editor). Guard on transactions: a programmatic setState() during a file switch reports
      // docChanged but carries no transaction, so it must NOT promote.
      EditorView.updateListener.of((update) => {
        if (update.docChanged && update.transactions.length > 0) panel?.promote()
      }),
    ],
  })
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
    if (view.value) view.value.setState(state)
    else if (editorEl.value) view.value = new EditorView({ state, parent: editorEl.value })
  },
})

async function save() {
  if (!view.value || !canSave.value) return
  try {
    await vfs.write(props.path, new TextEncoder().encode(view.value.state.doc.toString()))
  } catch (error) {
    // Don't swallow — a failed write silently loses edits.
    arxhub.logger.error(`[codemirror] failed to save ${props.path}:`, error)
    toaster.create({ title: 'Save failed', description: `Couldn't save ${props.path}`, type: 'error' })
    throw error
  }
}

onUnmounted(() => {
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="codemirror-wrapper" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <div class="codemirror-toolbar">
      <span class="codemirror-path">{{ path }}</span>
      <button class="save-btn" :disabled="!canSave" @click="save">Save</button>
    </div>
    <MarkdownToolbar v-if="note && !loadError" :view="view" />
    <div v-if="loadError" class="codemirror-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <button class="save-btn" @click="reload(path)">Retry</button>
    </div>
    <div v-show="!loadError" ref="editorEl" class="codemirror-editor" />
  </div>
</template>

<style scoped>
.codemirror-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.codemirror-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--gray-4);
  background: var(--gray-1);
  flex-shrink: 0;
}

.codemirror-path {
  font-size: 11px;
  color: var(--gray-9);
  font-family: var(--font-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-btn {
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid var(--gray-5);
  border-radius: 4px;
  background: var(--gray-2);
  color: var(--gray-11);
  cursor: pointer;
  flex-shrink: 0;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.codemirror-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--red-11);
  background: var(--red-2);
  border-bottom: 1px solid var(--red-6);
}

.save-btn:hover {
  background: var(--gray-3);
  color: var(--gray-12);
}

.codemirror-editor {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.codemirror-editor :deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}

.codemirror-editor :deep(.cm-scroller) {
  overflow: auto;
  font-family: var(--font-mono, monospace);
}
</style>
