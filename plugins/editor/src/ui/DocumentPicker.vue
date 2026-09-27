<script setup lang="ts">
import { Button, EmptyState, Row, ScrollArea, SearchField } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { EditorView } from 'prosemirror-view'
import { ref, watch } from 'vue'
import { type ArxDocumentLinks, type BlockDestination, type DocumentDestination, documentBlocks, documentHref } from '../document-links'
import { reasonText } from '../errors'
import { t } from '../i18n/messages'

const props = defineProps<{ links: ArxDocumentLinks; path: string; view: EditorView }>()
const emit = defineEmits<{ choose: [href: string] }>()
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const query = ref('')
const selected = ref<DocumentDestination | null>(null)
const documents = ref<DocumentDestination[]>([])
const blocks = ref<BlockDestination[]>([])
const busy = ref(false)
const error = ref('')
const retry = ref(0)
watch(
  [query, selected, retry, () => props.links.revision?.value],
  (_, __, cleanup) => {
    let active = true
    busy.value = true
    error.value = ''
    documents.value = []
    blocks.value = []
    const timer = setTimeout(
      async () => {
        try {
          const target = selected.value
          if (target) {
            const result = target.path === props.path ? documentBlocks(props.view.state.doc) : await props.links.blocks(target.path)
            if (active) blocks.value = result
          } else {
            const result = await props.links.documents(query.value)
            if (active) documents.value = result
          }
        } catch (reason) {
          if (active) error.value = reasonText(reason)
        } finally {
          if (active) busy.value = false
        }
      },
      selected.value ? 0 : 200,
    )
    cleanup(() => {
      active = false
      clearTimeout(timer)
    })
  },
  { immediate: true },
)
async function choose(anchor?: BlockDestination['anchor']) {
  const target = selected.value
  if (!target) return
  try {
    busy.value = true
    const href = props.links.href ? await props.links.href(target.path, anchor) : documentHref(target.path, anchor)
    emit('choose', href)
  } catch (reason) {
    error.value = reasonText(reason)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="document-picker" :class="{ touch }" :aria-label="t('picker.region')">
    <template v-if="selected">
      <Button :size="buttonSize" variant="ghost" @click="selected = null">{{ t('picker.back') }}</Button>
      <p>{{ selected.title || selected.path }}</p>
      <Button :size="buttonSize" variant="secondary" :disabled="busy" @click="choose()">{{ t('picker.wholeDocument') }}</Button>
      <p>{{ selected.path === path ? t('picker.chooseBlock') : t('picker.chooseSavedBlock') }}</p>
      <ScrollArea class="destination-list">
        <div :aria-label="t('picker.blocks')">
          <Row v-for="(block, index) in blocks" :key="index" as="button" type="button" wrap :disabled="busy" @click="choose(block.anchor)">{{ block.label }}</Row>
        </div>
      </ScrollArea>
      <EmptyState v-if="!busy && !error && !blocks.length" compact :text="t('picker.noBlocks')" />
    </template>
    <template v-else>
      <SearchField v-model="query" :aria-label="t('picker.searchAria')" :placeholder="t('picker.searchPlaceholder')" />
      <ScrollArea class="destination-list">
        <div :aria-label="t('picker.documents')">
          <Row v-for="document in documents" :key="document.path" as="button" type="button" wrap @click="selected = document">
            <span>{{ document.title || document.path }}<small>{{ document.path }}</small></span>
          </Row>
        </div>
      </ScrollArea>
      <EmptyState v-if="!busy && !error && !documents.length" compact icon="lu:search-x" :text="t('picker.noDocuments')" />
    </template>
    <p v-if="busy" role="status">{{ t('picker.loading') }}</p>
    <p v-if="error" role="alert">{{ error }} <Button :size="buttonSize" variant="secondary" @click="retry++">{{ t('picker.retry') }}</Button></p>
  </section>
</template>

<style scoped>
.document-picker { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.destination-list { max-height: 240px; overflow-wrap: anywhere; }
small { display: block; font-size: var(--font-size-xs); color: var(--gray-11); }
.document-picker.touch small { font-size: var(--font-size-sm); }
p { margin: 4px 0; }
</style>
