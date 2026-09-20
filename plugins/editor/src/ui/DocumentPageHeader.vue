<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-notes/ui'
import { Button, Icon } from '@arxhub/uikit/core'
import { onUnmounted, ref, watch } from 'vue'
import { useAssetSession } from '../asset-session'
import type { DocumentAppearance } from '../document-appearance'

const props = defineProps<{ path: string; appearance: DocumentAppearance; disabled: boolean }>()
const session = useAssetSession()
const url = ref('')
const error = ref('')
let ticket = 0
function release() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}
async function load() {
  const current = ++ticket
  release()
  error.value = ''
  const cover = props.appearance.cover
  if (!cover) return
  try {
    const bytes = await session.store.read(cover)
    if (ticket === current) url.value = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: cover.mime }))
  } catch (reason) {
    if (ticket === current) error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
watch(
  () => props.appearance.cover?.path,
  () => {
    void load()
  },
  { immediate: true },
)
onUnmounted(() => {
  ticket++
  release()
})
</script>
<template>
  <header class="document-page-header">
    <img v-if="url" class="document-cover" :src="url" alt="Page cover" @error="release(); error = 'The image could not be decoded'" />
    <div v-if="error" role="alert">Could not load cover: {{ error }}<Button variant="ghost" @click="load">Retry cover</Button></div>
    <div class="document-page-title">
      <Icon v-if="appearance.icon" :name="appearance.icon" :size="20" aria-hidden="true" />
      <DocumentName :path="path" inline :disabled="disabled" />
    </div>
  </header>
</template>
<style scoped>
.document-page-header { max-width: 760px; margin: 0 auto 16px; }
.document-page-title { display: flex; align-items: center; gap: 8px; }
.document-cover { display: block; width: 100%; aspect-ratio: 4 / 1; object-fit: cover; border-radius: var(--radius-xs); margin-bottom: 16px; }
</style>
