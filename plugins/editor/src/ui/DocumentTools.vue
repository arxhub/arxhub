<script setup lang="ts">
import { type ActionItem, Dropdown, IconButton, MenuItem } from '@arxhub/uikit/core'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick } from 'vue'
import { EDITOR_MODES, modeDescription, modeLabel } from '../document-bar'
import type { ArxDocumentLinks } from '../document-links'
import { focusDocument } from '../document-navigation'
import type { EditorMode } from '../editor-mode'
import { t } from '../i18n/messages'
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
  onAppearance?: () => void
  publicationActions?: readonly ActionItem[]
}>()
const emit = defineEmits<{ find: []; outline: []; backlinks: []; copyLink: []; versions: []; properties: [] }>()
const mode = defineModel<EditorMode>('mode', { default: 'editable' })
// The desktop's tools, in the tab strip. The phone lists the same tools in its object band's More
// (`document-bar.ts`), so this menu is only ever drawn by the desktop frame.
const modes = EDITOR_MODES
const modeTitle = computed(() => t('modes.row', { mode: modeLabel(mode.value) }))

async function selectMode(value: EditorMode) {
  mode.value = value
  await nextTick()
  requestAnimationFrame(() => {
    if (props.view && !props.view.isDestroyed) focusDocument(props.view)
  })
}

// Undo and redo are offered in interactive mode too: a value change is undoable there, and the mode's
// own transaction filter refuses a step that would bring text back (see editor-keymap.ts).
function cmd(command: Command) {
  if (!props.view || !props.canSave || mode.value === 'readonly') return
  command(props.view.state, props.view.dispatch)
  props.view.focus()
}
</script>

<template>
  <Dropdown placement="bottom-end">
    <template #trigger>
      <IconButton size="lg" icon="lu:ellipsis" :tooltip="t('tools.trigger')" :title="modeTitle" />
    </template>
    <MenuItem v-for="item in modes" :key="item" :value="item" :disabled="busy" :title="modeDescription(item)" :aria-current="mode === item ? 'true' : undefined" @select="selectMode(item)">{{ modeLabel(item) }}</MenuItem>
    <MenuItem value="properties" :disabled="!canSave" @select="emit('properties')">{{ t('tools.properties') }}</MenuItem>
    <MenuItem v-if="onAppearance" value="appearance" :disabled="!canSave || busy || mode !== 'editable'" @select="onAppearance()">{{ t('tools.appearance') }}</MenuItem>
    <MenuItem v-if="mode !== 'readonly'" value="save" :disabled="!canSave" @select="onSave?.()">{{ t('tools.save') }}</MenuItem>
    <MenuItem v-for="action in HISTORY" v-show="mode !== 'readonly'" :key="action.id" :value="action.id" :disabled="!canSave || !view || !action.run(view.state)" @select="cmd(action.run)">{{ action.label() }}</MenuItem>
    <MenuItem value="find" :disabled="!canSave" @select="emit('find')">{{ t('tools.find') }}</MenuItem>
    <MenuItem value="outline" :disabled="!canSave" @select="emit('outline')">{{ t('tools.outline') }}</MenuItem>
    <MenuItem v-if="links" value="backlinks" :disabled="!canSave" @select="emit('backlinks')">{{ t('tools.backlinks') }}</MenuItem>
    <MenuItem v-if="links" value="copy-block-link" :disabled="!canSave" @select="emit('copyLink')">{{ t('tools.copyLink') }}</MenuItem>
    <MenuItem v-for="action in publicationActions" :key="action.id" :value="action.id" :disabled="!canSave || busy || action.disabled" @select="action.onSelect?.()">{{ action.label }}</MenuItem>
    <MenuItem v-if="hasHistory" value="versions" :disabled="!canSave" @select="emit('versions')">{{ t('tools.versions') }}</MenuItem>
  </Dropdown>
</template>
