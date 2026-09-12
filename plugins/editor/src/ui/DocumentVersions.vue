<script setup lang="ts">
import { Button, Dialog, Row } from '@arxhub/uikit/core'
import { ref, watch } from 'vue'
import { type ArxHistoryStore, type ArxSavedVersion, versionText } from '../document-history'
import type { ArxEditorKit } from '../editor-extension'
import { deserialize } from '../editor-format'
import type { EditorMode } from '../editor-mode'

const props = defineProps<{
  store: ArxHistoryStore
  documentId: string
  kit: ArxEditorKit
  mode: EditorMode
  restore: (content: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const versions = ref<ArxSavedVersion[]>([])
const selected = ref<ArxSavedVersion | null>(null)
const raw = ref('')
const preview = ref('')
const showRaw = ref(false)
const loading = ref(false)
const reading = ref(false)
const restoring = ref(false)
const error = ref('')
const previewError = ref('')
const refresh = ref(0)
watch(
  [() => props.documentId, refresh],
  async (_, __, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    loading.value = true
    error.value = ''
    try {
      const rows = await props.store.list(props.documentId)
      if (active) {
        versions.value = rows
        selected.value = rows.find((row) => row.id === selected.value?.id) ?? rows[0] ?? null
      }
    } catch (reason) {
      if (active) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (active) loading.value = false
    }
  },
  { immediate: true },
)
watch(selected, async (version, _, cleanup) => {
  let active = true
  cleanup(() => {
    active = false
  })
  raw.value = ''
  preview.value = ''
  previewError.value = ''
  if (!version) return
  reading.value = true
  try {
    const stored = await props.store.read(props.documentId, version)
    if (!active) return
    raw.value = stored.content
    preview.value = versionText(deserialize(props.kit.schema, stored.content, props.kit.format))
  } catch (reason) {
    if (active) previewError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (active) reading.value = false
  }
})
async function restore() {
  if (!raw.value || previewError.value || props.mode !== 'editable') return
  restoring.value = true
  error.value = ''
  try {
    await props.restore(raw.value)
    emit('close')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <Dialog open title="Saved versions" size="lg" :close-on-escape="!restoring" :close-on-interact-outside="!restoring" @update:open="!$event && !restoring && emit('close')">
    <p v-if="store.limit">Up to {{ store.limit }} saved versions are kept per document.</p>
    <p v-if="loading" role="status">Loading versions…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <nav class="version-list" aria-label="Saved document versions">
      <Row v-for="(version, index) in versions" :key="version.id" as="button" type="button" :selected="selected?.id === version.id" :disabled="restoring" @click="selected = version">Version {{ versions.length - index }} · {{ new Date(version.savedAt).toLocaleString() }}</Row>
    </nav>
    <p v-if="!loading && !error && !versions.length">History starts when this document is saved.</p>
    <template v-if="selected">
      <Button variant="ghost" @click="showRaw = !showRaw">{{ showRaw ? 'Show text preview' : 'Show raw .arx' }}</Button>
      <p v-if="reading" role="status">Loading preview…</p>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <pre class="version-preview" aria-label="Version preview">{{ showRaw ? raw : preview }}</pre>
      <p v-if="mode === 'editable'">Your current draft will be saved before restoring this version.</p>
      <p v-else>Switch to Editable to restore a version.</p>
    </template>
    <template #footer>
      <Button variant="ghost" :disabled="restoring" @click="refresh++">Refresh versions</Button>
      <Button variant="secondary" :disabled="restoring || reading || !raw || !!previewError || mode !== 'editable'" @click="restore">{{ restoring ? 'Restoring…' : 'Restore this version' }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.version-list { max-height: 144px; overflow: auto; }
.version-preview { max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--gray-1); border: 1px solid var(--gray-6); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: var(--font-size-sm); }
p { margin-block: 8px; font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
