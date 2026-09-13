<script setup lang="ts">
import { type ActionItem, Dropdown, IconButton, MenuItem } from '@arxhub/uikit/core'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick } from 'vue'
import type { ArxDocumentLinks } from '../document-links'
import { focusDocument } from '../document-navigation'
import type { EditorMode } from '../editor-mode'
import { HISTORY } from './toolbar-actions'

const props = defineProps<{
  view: EditorView | null
  onSave?: () => void
  canSave: boolean
  revision?: number
  busy?: boolean
  links?: ArxDocumentLinks | null
  path?: string
  hasHistory?: boolean
  publicationActions?: readonly ActionItem[]
}>()
const emit = defineEmits<{ find: []; outline: []; backlinks: []; copyLink: []; versions: [] }>()
const mode = defineModel<EditorMode>('mode', { default: 'editable' })
const modes: { value: EditorMode; label: string; description: string }[] = [
  { value: 'readonly', label: 'Read only', description: 'Read and copy; no changes' },
  { value: 'editable', label: 'Editable', description: 'Write, format and arrange blocks' },
  { value: 'interactive', label: 'Interactive', description: 'Change control values; protect text' },
]
const modeLabel = computed(() => modes.find((item) => item.value === mode.value)?.label)

async function selectMode(value: EditorMode) {
  mode.value = value
  await nextTick()
  requestAnimationFrame(() => {
    if (props.view && !props.view.isDestroyed) focusDocument(props.view)
  })
}

function cmd(command: Command) {
  if (!props.view || !props.canSave || mode.value !== 'editable') return
  command(props.view.state, props.view.dispatch)
  props.view.focus()
}
</script>

<template>
  <Dropdown placement="top-end">
    <template #trigger><IconButton icon="lu:ellipsis" tooltip="Document tools" :title="`Editor mode: ${modeLabel}`" /></template>
    <MenuItem v-for="item in modes" :key="item.value" :value="item.value" :disabled="busy" :title="item.description" :aria-current="mode === item.value ? 'true' : undefined" @select="selectMode(item.value)">{{ item.label }}</MenuItem>
    <MenuItem v-if="mode !== 'readonly'" value="save" :disabled="!canSave" @select="onSave?.()">Save</MenuItem>
    <MenuItem v-for="action in HISTORY" v-show="mode === 'editable'" :key="action.label" :value="action.label" :disabled="!canSave || !view || !action.run(view.state)" @select="cmd(action.run)">{{ action.label }}</MenuItem>
    <MenuItem value="find" :disabled="!canSave" @select="emit('find')">Find in document</MenuItem>
    <MenuItem value="outline" :disabled="!canSave" @select="emit('outline')">Document outline</MenuItem>
    <MenuItem v-if="links" value="backlinks" :disabled="!canSave" @select="emit('backlinks')">Backlinks</MenuItem>
    <MenuItem v-if="links" value="copy-block-link" :disabled="!canSave" @select="emit('copyLink')">Copy link to block</MenuItem>
    <MenuItem v-for="action in publicationActions" :key="action.id" :value="action.id" :disabled="!canSave || busy || action.disabled" @select="action.onSelect?.()">{{ action.label }}</MenuItem>
    <MenuItem v-if="hasHistory" value="versions" :disabled="!canSave" @select="emit('versions')">Saved versions</MenuItem>
  </Dropdown>
</template>
