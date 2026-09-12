<script setup lang="ts">
import { validation } from '@arxhub/errors'
import { Button, Dropdown, Input, MenuItem, Row } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import type { ArxDataItem, DataLayout } from '../data-sources'
import { ArxEditorExtension } from '../editor-extension'
import DataBoardDesktop from './DataBoardDesktop.vue'
import DataBoardMobile from './DataBoardMobile.vue'

const props = defineProps<ArxEditorControlProps>()
const editor = useArxHub().extensions.get(ArxEditorExtension)
const sources = editor.kit.dataSources
const source = computed(() => sources[String(props.node.attrs.source)])
const layout = computed(() => String(props.node.attrs.layout) as DataLayout)
const board = useShellFrame() === 'mobile' ? DataBoardMobile : DataBoardDesktop
const items = ref<ArxDataItem[]>([])
const busy = ref(false)
const error = ref('')
const refresh = ref(0)
const truncated = ref(false)
const month = ref(new Date().toISOString().slice(0, 7))
const groups = computed(() => {
  const grouped = new Map<string, ArxDataItem[]>()
  for (const item of items.value) {
    const key = layout.value === 'calendar' ? item.date : item.group || 'Other'
    if (!key || (layout.value === 'calendar' && !key.startsWith(month.value))) continue
    const entries = grouped.get(key) ?? []
    entries.push(item)
    grouped.set(key, entries)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([title, items]) => ({ title, items }))
})
function configure(attrs: Record<string, unknown>) {
  if (props.mode === 'editable') props.change(attrs)
}
watch(
  [source, () => props.node.attrs.query, () => source.value?.revision?.value, refresh],
  async (_, __, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    busy.value = true
    error.value = ''
    items.value = []
    try {
      if (!source.value) throw validation('Enable the plugin that provides this data source. Built-in sources require Search.')
      const result = await source.value.load(String(props.node.attrs.query))
      if (active) {
        items.value = result.items.slice(0, 200)
        truncated.value = !!result.truncated || result.items.length > 200
      }
    } catch (reason) {
      if (active) error.value = reason instanceof Error ? reason.message : String(reason)
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
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
</script>

<template>
  <section class="data-view" aria-label="Data view">
    <div class="data-options">
      <Dropdown><template #trigger><Button variant="ghost" :disabled="mode !== 'editable'">{{ source?.label ?? node.attrs.source }}</Button></template><MenuItem v-for="(entry, id) in sources" :key="id" :value="String(id)" @select="configure({ source: id, layout: entry.layouts[0] })">{{ entry.label }}</MenuItem></Dropdown>
      <Dropdown><template #trigger><Button variant="ghost" :disabled="mode !== 'editable'">{{ layout }}</Button></template><MenuItem v-for="option in source?.layouts ?? ['list']" :key="option" :value="option" @select="configure({ layout: option })">{{ option }}</MenuItem></Dropdown>
      <Button variant="ghost" @click="refresh++">Refresh data</Button>
    </div>
    <Input :model-value="String(node.attrs.query)" :readonly="mode !== 'editable'" aria-label="Filter data" placeholder="Filter by text" @update:model-value="configure({ query: $event })" />
    <p v-if="busy" role="status">Loading data…</p><p v-if="error" role="alert">{{ error }}</p>
    <component :is="board" v-if="layout === 'board'" :groups="groups" @open="open" />
    <template v-else-if="layout === 'calendar'">
      <Input v-model="month" type="month" aria-label="Calendar month" />
      <section v-for="group in groups" :key="group.title"><h3>{{ group.title }}</h3><Row v-for="item in group.items" :key="item.id" as="button" type="button" wrap @click="open(item)">{{ item.title }}</Row></section>
      <p v-if="!busy && !error && !groups.length">No dated items in this month.</p>
    </template>
    <div v-else aria-label="Data list"><Row v-for="item in items" :key="item.id" as="button" type="button" wrap @click="open(item)">{{ item.title }}<small>{{ item.group }}</small></Row></div>
    <p v-if="!busy && !error && !items.length">No matching items.</p>
    <p v-if="truncated">Showing the first 200 items. Narrow the filter to see more.</p>
    <p class="data-help">Results open their source documents.</p><p v-if="layout === 'calendar' && node.attrs.source === 'documents'" class="data-help">Dates show when documents were last modified.</p>
  </section>
</template>

<style scoped>
.data-view { padding: 12px; border: 1px solid var(--gray-6); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 8px; }
.data-options { display: flex; flex-wrap: wrap; gap: 8px; }
p, h3 { margin: 0; font-size: var(--font-size-sm); color: var(--gray-11); }
small, .data-help { font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
