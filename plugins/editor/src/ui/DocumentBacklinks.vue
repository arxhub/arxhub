<script setup lang="ts">
import { Button, Dialog, EmptyState, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { ref, watch } from 'vue'
import type { ArxDocumentLinks, DocumentDestination } from '../document-links'
import { reasonText } from '../errors'
import { t } from '../i18n/messages'

const props = defineProps<{ links: ArxDocumentLinks; path: string }>()
const emit = defineEmits<{ close: [] }>()
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
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
      if (active) error.value = reasonText(reason)
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
    error.value = reasonText(reason)
  }
}
</script>

<template>
  <Dialog open :title="t('tools.backlinks')" size="sm" @update:open="$event || emit('close')">
    <div class="backlinks" :class="{ touch }">
    <p v-if="busy" role="status">{{ t('backlinks.loading') }}</p>
    <p v-if="error" role="alert">{{ error }} <Button :size="buttonSize" variant="secondary" @click="retry++">{{ t('backlinks.retry') }}</Button></p>
    <nav v-else :aria-label="t('backlinks.nav')">
      <Row v-for="document in results" :key="document.path" as="button" type="button" wrap @click="open(document.path)"><span>{{ document.title || document.path }}<small>{{ document.path }}</small></span></Row>
      <EmptyState v-if="!busy && !results.length" compact icon="lu:link" :text="t('backlinks.empty')" />
    </nav>
    </div>
  </Dialog>
</template>

<style scoped>
.backlinks.touch small { font-size: var(--font-size-sm); }
small { display: block; font-size: var(--font-size-xs); color: var(--gray-11); overflow-wrap: anywhere; }
</style>
