<script setup lang="ts">
import { formatDate } from '@arxhub/i18n'
import { Button, EmptyState, Input, Row } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { type ArxDataItem, type DataLayout, localDay } from '../data-sources'
import { ArxEditorExtension } from '../editor-extension'
import { editorError, reasonText } from '../errors'
import { t } from '../i18n/messages'
import DataBoardDesktop from './DataBoardDesktop.vue'
import DataBoardMobile from './DataBoardMobile.vue'
import DataListDesktop from './DataListDesktop.vue'
import DataListMobile from './DataListMobile.vue'

const props = defineProps<ArxEditorControlProps>()
const editor = useArxHub().extensions.get(ArxEditorExtension)
const sources = editor.kit.dataSources
const source = computed(() => sources[String(props.node.attrs.source)])
const layout = computed(() => String(props.node.attrs.layout) as DataLayout)
const frame = useShellFrame()
const board = frame === 'mobile' ? DataBoardMobile : DataBoardDesktop
const list = frame === 'mobile' ? DataListMobile : DataListDesktop
const touch = frame === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const items = ref<ArxDataItem[]>([])
const busy = ref(false)
const error = ref('')
const refresh = ref(0)
const truncated = ref(false)
const month = ref(localDay(Date.now()).slice(0, 7))
const groups = computed(() => {
  const grouped = new Map<string, ArxDataItem[]>()
  for (const item of items.value) {
    const key = layout.value === 'calendar' ? item.date : item.group || t('data.groups.ungrouped')
    if (!key || (layout.value === 'calendar' && !key.startsWith(month.value))) continue
    const entries = grouped.get(key) ?? []
    entries.push(item)
    grouped.set(key, entries)
  }
  // A day is stored as its YYYY-MM-DD key and named in the reader's language; read as a UTC day, so no
  // timezone moves it to the day before.
  const title = (key: string) => (layout.value === 'calendar' ? formatDate(`${key}T00:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' }) : key)
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, title: title(key), items }))
})
watch(
  [source, () => props.node.attrs.query, () => source.value?.revision?.value, refresh],
  async ([currentSource, query], previous, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    busy.value = true
    error.value = ''
    if (currentSource !== previous[0] || query !== previous[1]) {
      items.value = []
      truncated.value = false
    }
    try {
      if (!source.value) throw editorError('DataSourceUnavailableError')
      const result = await source.value.load(String(props.node.attrs.query))
      if (active) {
        items.value = result.items.slice(0, 200)
        truncated.value = !!result.truncated || result.items.length > 200
      }
    } catch (reason) {
      if (active) error.value = reasonText(reason)
    } finally {
      if (active) busy.value = false
    }
  },
  { immediate: true },
)
async function open(item: ArxDataItem) {
  try {
    await editor.links?.open(item.path, item.anchor)
  } catch (reason) {
    error.value = reasonText(reason)
  }
}
</script>

<template>
  <section class="data-view" :class="{ touch }" :aria-label="t('blocks.collection')" :aria-busy="busy">
    <div class="data-options">
      <Button :size="buttonSize" variant="ghost" @click="refresh++">{{ t('data.refresh') }}</Button>
    </div>
    <p v-if="busy && !items.length" role="status">{{ t('data.loading') }}</p><p v-if="error" role="alert">{{ error }}</p>
    <component :is="board" v-if="layout === 'board'" :groups="groups" @open="open" />
    <template v-else-if="layout === 'calendar'">
      <Input v-model="month" type="month" :aria-label="t('data.calendarMonth')" />
      <section v-for="group in groups" :key="group.key"><h3>{{ group.title }}</h3><Row v-for="item in group.items" :key="item.id" as="button" type="button" wrap @click="open(item)">{{ item.title }}</Row></section>
      <EmptyState v-if="!busy && !error && !groups.length" compact icon="lu:calendar" :text="t('data.noDated')" />
    </template>
    <component :is="list" v-else :items="items" @open="open" />
    <EmptyState v-if="!busy && !error && !items.length" compact icon="lu:search-x" :text="t('data.noMatching')" />
    <p v-if="truncated">{{ t('data.truncated', { count: 200 }) }}</p>
    <p class="data-help">{{ t('data.help') }}</p><p v-if="layout === 'calendar' && node.attrs.source === 'documents'" class="data-help">{{ t('data.datesHelp') }}</p>
  </section>
</template>

<style scoped>
.data-view { padding: 12px; border: 1px solid var(--gray-6); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 8px; }
.data-options { display: flex; flex-wrap: wrap; gap: 8px; }
p, h3 { margin: 0; font-size: var(--font-size-sm); color: var(--gray-11); }
.data-help { font-size: var(--font-size-xs); color: var(--gray-11); }
.data-view.touch .data-help { font-size: var(--font-size-sm); }
</style>
