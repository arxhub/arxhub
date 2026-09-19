<script setup lang="ts">
import { Button, Dialog, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import { computed, ref, shallowRef, watch } from 'vue'
import { type ArxHistoryStore, type ArxSavedVersion, versionText } from '../document-history'
import type { ArxEditorKit } from '../editor-extension'
import { deserialize } from '../editor-format'
import type { EditorMode } from '../editor-mode'
import { versionDifferences } from '../version-diff'

const props = defineProps<{
  store: ArxHistoryStore
  documentId: string
  kit: ArxEditorKit
  mode: EditorMode
  current: Node
  restore: (content: string, block?: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const versions = ref<ArxSavedVersion[]>([])
const selected = ref<ArxSavedVersion | null>(null)
const raw = ref('')
const previous = shallowRef<Node | null>(null)
const selectedBlock = ref<string | null>(null)
const differences = computed(() => (previous.value ? versionDifferences(props.current, previous.value) : []))
const difference = computed(() => differences.value.find((item) => item.key === selectedBlock.value))
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
  previous.value = null
  selectedBlock.value = null
  preview.value = ''
  previewError.value = ''
  if (!version) return
  reading.value = true
  try {
    const stored = await props.store.read(props.documentId, version)
    if (!active) return
    raw.value = stored.content
    previous.value = deserialize(props.kit.schema, stored.content, props.kit.format)
    preview.value = versionText(previous.value)
  } catch (reason) {
    if (active) previewError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (active) reading.value = false
  }
})
async function restore(block?: string) {
  if (!raw.value || previewError.value || props.mode !== 'editable') return
  restoring.value = true
  error.value = ''
  try {
    await props.restore(raw.value, block)
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
      <Button :size="buttonSize" variant="ghost" @click="showRaw = !showRaw">{{ showRaw ? 'Show text preview' : 'Show raw .arx' }}</Button>
      <p v-if="reading" role="status">Loading preview…</p>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <pre class="version-preview" aria-label="Version preview">{{ showRaw ? raw : preview }}</pre>
      <nav aria-label="Changes from saved version" class="version-list">
        <Row v-for="change in differences" :key="change.key" as="button" type="button" :selected="selectedBlock === change.key" :disabled="restoring" @click="selectedBlock = change.key">{{ change.kind }} · {{ (change.after ?? change.before)?.textContent || (change.after ?? change.before)?.type.name }}</Row>
      </nav>
      <p v-if="!reading && previous && !differences.length">No block changes from this version.</p>
      <template v-if="difference">
        <p>Saved block</p><pre class="version-preview" aria-label="Saved block preview">{{ difference.before ? versionText(difference.before) || difference.before.textContent : 'Not present in this version' }}</pre>
        <p>Current block</p><pre class="version-preview" aria-label="Current block preview">{{ difference.after ? versionText(difference.after) || difference.after.textContent : 'Removed from the document' }}</pre>
      </template>
      <p v-if="mode === 'editable'">Your current draft will be saved before restoring this version.</p>
      <p v-else>Switch to Editable to restore a version.</p>
    </template>
    <template #footer>
      <Button :size="buttonSize" variant="ghost" :disabled="restoring" @click="refresh++">Refresh versions</Button>
      <Button v-if="difference" :size="buttonSize" variant="secondary" :disabled="restoring || reading || mode !== 'editable'" @click="restore(difference.key)">{{ difference.kind === 'added' ? 'Remove added block' : 'Restore selected block' }}</Button>
      <Button :size="buttonSize" variant="secondary" :disabled="restoring || reading || !raw || !!previewError || mode !== 'editable'" @click="restore()">{{ restoring ? 'Restoring…' : 'Restore this version' }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.version-list { max-height: 144px; overflow: auto; }
.version-preview { max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--gray-1); border: 1px solid var(--gray-6); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: var(--font-size-sm); }
p { margin-block: 8px; font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
