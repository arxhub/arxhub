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
        EditorState.readOnly.of(true),
        ...(langSupport ? [langSupport] : []),
      ],
    }),
    parent: editorEl.value,
  })
})

onUnmounted(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="editorEl" class="codemirror-editor" />
</template>

<style scoped>
.codemirror-editor {
  width: 100%;
  height: 100%;
  overflow: auto;
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
