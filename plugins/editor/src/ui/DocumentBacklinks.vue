<script setup lang="ts">
import { Button, Dialog, Row } from '@arxhub/uikit/core'
import { ref, watch } from 'vue'
import type { ArxDocumentLinks, DocumentDestination } from '../document-links'

const props = defineProps<{ links: ArxDocumentLinks; path: string }>()
const emit = defineEmits<{ close: [] }>()
const results = ref<DocumentDestination[]>([])
const busy = ref(false)
const error = ref('')
const retry = ref(0)
watch(
  [() => props.path, () => props.links.revision?.value, retry],
  async (_, __, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    busy.value = true
    error.value = ''
    try {
      const rows = await props.links.backlinks(props.path)
      if (active) results.value = rows
    } catch (reason) {
      if (active) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (active) busy.value = false
    }
  },
  { immediate: true },
)
async function open(path: string) {
  try {
    await props.links.open(path)
    emit('close')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
</script>

<template>
  <Dialog open title="Backlinks" size="sm" @update:open="$event || emit('close')">
    <p v-if="busy" role="status">Loading backlinks…</p>
    <p v-if="error" role="alert">{{ error }} <Button variant="secondary" @click="retry++">Retry backlinks</Button></p>
    <nav v-else aria-label="Documents linking here">
      <Row v-for="document in results" :key="document.path" as="button" type="button" wrap @click="open(document.path)"><span>{{ document.title || document.path }}<small>{{ document.path }}</small></span></Row>
      <p v-if="!busy && !results.length">No indexed documents link here yet.</p>
    </nav>
  </Dialog>
</template>

<style scoped>
small { display: block; font-size: var(--font-size-xs); color: var(--gray-11); overflow-wrap: anywhere; }
</style>
