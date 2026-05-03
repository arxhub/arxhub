<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { basicSetup, EditorView } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { useArxHub } from '@arxhub/uikit/hooks'
import { VfsExtension } from '@arxhub/plugin-vfs/ui'

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const editorEl = ref<HTMLDivElement>()
let view: EditorView | null = null

onMounted(async () => {
  if (!editorEl.value) return

  const { vfs } = arxhub.extensions.get(VfsExtension)
  const bytes = await vfs.read(props.path)
  const doc = new TextDecoder().decode(bytes)

  const langDesc = LanguageDescription.matchFilename(languages, props.path)
  const langSupport = langDesc ? await langDesc.load() : null

  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ...(langSupport ? [langSupport] : []),
      ],
    }),
    parent: editorEl.value,
  })
})

async function save() {
  if (!view) return
  const { vfs } = arxhub.extensions.get(VfsExtension)
  await vfs.write(props.path, new TextEncoder().encode(view.state.doc.toString()))
}

onUnmounted(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div class="codemirror-wrapper" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <div class="codemirror-toolbar">
      <span class="codemirror-path">{{ path }}</span>
      <button class="save-btn" @click="save">Save</button>
    </div>
    <div ref="editorEl" class="codemirror-editor" />
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
