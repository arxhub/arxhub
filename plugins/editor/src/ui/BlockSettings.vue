<script setup lang="ts">
import { Button, Dropdown, Input, MenuItem, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { toggleHeaderRow } from 'prosemirror-tables'
import { computed, ref } from 'vue'
import { CODE_LANGUAGES } from '../code-highlighting'
import { arrangeColumns } from '../columns'
import type { ArxDataSource } from '../data-sources'
import type { ArxEditorComponent } from '../editor-extension'
import type { EditorMode } from '../editor-mode'
import AssetSettings from './AssetSettings.vue'
import SelectSettings from './SelectSettings.vue'

const props = defineProps<{
  node: Node
  mode: EditorMode
  change: (attrs: Record<string, unknown>) => void
  run: (command: Command, inside?: boolean) => void
  sources: Readonly<Record<string, ArxDataSource>>
  definition?: ArxEditorComponent
  replace: (nodes: readonly Node[]) => void
}>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const query = ref('')
const choices = computed(() => CODE_LANGUAGES.filter((language) => language.toLowerCase().includes(query.value.toLowerCase())))
const source = computed(() => props.sources[String(props.node.attrs.source)])
const labels: Record<string, string> = { list: 'List', board: 'Grouped', calendar: 'By date' }
</script>
<template>
  <div class="block-settings">
    <component v-if="definition?.settings" :is="definition.settings" :node="node" :mode="mode" :change="change" :replace="replace" />
    <template v-else-if="node.type.name === 'columns'">
      <span>Number of columns</span>
      <div class="settings-actions"><Button v-for="count in ([2, 3] as const)" :key="count" :size="buttonSize" :variant="node.childCount === count ? 'primary' : 'secondary'" @click="run(arrangeColumns(count))">{{ count }} columns</Button></div>
      <Button :size="buttonSize" variant="ghost" @click="run(arrangeColumns(1))">Stack columns</Button>
    </template>
    <template v-else-if="node.type.name === 'table'">
      <Button :size="buttonSize" variant="secondary" :aria-pressed="node.firstChild?.firstChild?.type.name === 'table_header'" @click="run(toggleHeaderRow, true)">Header row</Button>
    </template>
    <SelectSettings v-else-if="node.type.name === 'select'" :node="node" :mode="mode" :change="change" :replace="replace" />
    <AssetSettings v-else-if="node.type.name === 'image_block' || node.type.name === 'attachment'" :node="node" :mode="mode" :change="change" :replace="replace" />
    <template v-else-if="node.type.name === 'data_view'">
      <div class="setting-field"><span>Source</span><Dropdown><template #trigger><Button :size="buttonSize" variant="secondary" aria-label="Source">{{ source?.label ?? node.attrs.source }}</Button></template><MenuItem v-for="(entry, id) in sources" :key="id" :value="String(id)" @select="change({ source: id, layout: entry.layouts[0] })">{{ entry.label }}</MenuItem></Dropdown></div>
      <div class="setting-field"><span>View</span><Dropdown><template #trigger><Button :size="buttonSize" variant="secondary" aria-label="View">{{ labels[String(node.attrs.layout)] }}</Button></template><MenuItem v-for="option in source?.layouts ?? ['list']" :key="option" :value="option" @select="change({ layout: option })">{{ labels[option] }}</MenuItem></Dropdown></div>
      <label>Filter<Input :model-value="String(node.attrs.query)" aria-label="Filter data" placeholder="Filter by text" @update:model-value="change({ query: $event })" /></label>
    </template>
    <template v-else-if="node.type.name === 'code_block'">
      <Input v-model="query" aria-label="Search code languages" placeholder="Search languages" />
      <nav aria-label="Code languages">
        <Row as="button" type="button" :selected="!node.attrs.language" @click="change({ language: '' })">Plain text</Row>
        <Row v-for="language in choices" :key="language" as="button" type="button" :selected="node.attrs.language === language" @click="change({ language })">{{ language }}</Row>
      </nav>
    </template>
    <template v-else-if="node.type.name === 'section'"><label>Title<Input :model-value="node.attrs.title" aria-label="Section title" @update:model-value="change({ title: $event })" /></label></template>
    <template v-else-if="node.type.name === 'callout'">
      <span>Style</span><nav aria-label="Callout style"><Row v-for="(label, type) in { info: 'Information', warning: 'Warning', success: 'Success', danger: 'Danger' }" :key="type" as="button" type="button" :selected="node.attrs.type === type" @click="change({ type })">{{ label }}</Row></nav>
    </template>
  </div>
</template>
<style scoped>
.block-settings { display: flex; flex-direction: column; gap: 12px; font-size: var(--font-size-sm); }
label, .setting-field { display: flex; flex-direction: column; gap: 4px; }
.settings-actions { display: flex; gap: 8px; flex-wrap: wrap; }
nav { max-height: 400px; overflow-y: auto; }
</style>
