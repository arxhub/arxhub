<script setup lang="ts">
import { actionMenu, Button, Dropdown, FormattingToolbar, IconButton, MenuItem, Strip } from '@arxhub/uikit/core'
import { toggleMark } from 'prosemirror-commands'
import type { MarkType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { isInTable } from 'prosemirror-tables'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick, ref } from 'vue'
import { insertBlock } from '../block-actions'
import type { ArxDocumentLinks } from '../document-links'
import { focusDocument } from '../document-navigation'
import { buildKeymap } from '../editor-keymap'
import type { EditorMode } from '../editor-mode'
import type { BlockCommand } from '../slash-commands'
import { TABLE_ACTIONS } from '../table-actions'
import { openBlockMenu } from './block-menu'
import LinkDialog from './LinkDialog.vue'
import { HISTORY, MARKS } from './toolbar-actions'

const props = defineProps<{
  view: EditorView | null
  onSave?: () => void
  canSave: boolean
  revision?: number
  commands: readonly BlockCommand[]
  busy?: boolean
  links?: ArxDocumentLinks | null
  path?: string
  hasHistory?: boolean
}>()
const linkOpen = ref(false)
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

function isMarkActive(markType: MarkType): boolean {
  if (!props.view) return false
  const { from, $from, to, empty } = props.view.state.selection
  if (empty) return !!markType.isInSet(props.view.state.storedMarks ?? $from.marks())
  return props.view.state.doc.rangeHasMark(from, to, markType)
}

function insert() {
  const view = props.view
  if (!view) return
  const rect = view.coordsAtPos(view.state.selection.from)
  actionMenu.open(
    props.commands.map((command) => ({
      id: command.id,
      label: command.label,
      icon: command.icon,
      onSelect: () => cmd(insertBlock(command)),
    })),
    { title: 'Insert block', x: rect.left, y: rect.bottom },
  )
}

function blocks() {
  const view = props.view
  if (!view) return
  const rect = view.coordsAtPos(view.state.selection.from)
  openBlockMenu(view, rect.left, rect.bottom)
}

function tableActions() {
  const current = props.view
  if (!current) return
  const rect = current.coordsAtPos(current.state.selection.from)
  actionMenu.open(
    TABLE_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      disabled: !action.run(current.state),
      onSelect: () => cmd(action.run),
    })),
    { title: 'Table actions', x: rect.left, y: rect.bottom },
  )
}

const actions = computed(() => {
  void props.revision
  return [
    { id: 'insert', label: 'Insert block', icon: 'lu:plus', primary: true, run: insert },
    ...(props.view && isInTable(props.view.state)
      ? [{ id: 'table-actions', label: 'Table actions', icon: 'lu:table', primary: true, run: tableActions }]
      : []),
    ...MARKS.map((action) => {
      const mark = props.view?.state.schema.marks[action.mark.name] ?? action.mark
      return {
        id: action.label,
        label: action.label,
        icon: action.icon,
        primary: action.label === 'Bold',
        active: isMarkActive(mark),
        run: () => cmd(toggleMark(mark)),
      }
    }),
    {
      id: 'link',
      label: 'Link',
      icon: 'lu:link',
      run: () => {
        linkOpen.value = true
      },
    },
    ...props.commands
      .filter((action) => !['select', 'divider', 'image', 'attachment', 'table'].includes(action.id))
      .map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        run: () => cmd(action.run),
      })),
    {
      id: 'indent',
      label: 'Indent list item',
      icon: 'lu:list-indent-increase',
      run: () => {
        if (props.view) cmd(buildKeymap(props.view.state.schema).Tab)
      },
    },
    {
      id: 'outdent',
      label: 'Outdent list item',
      icon: 'lu:list-indent-decrease',
      run: () => {
        if (props.view) cmd(buildKeymap(props.view.state.schema)['Shift-Tab'])
      },
    },
    { id: 'block-actions', label: 'Current block', icon: 'lu:grip-vertical', run: blocks },
    ...HISTORY.map((action) => ({ id: action.label, label: action.label, icon: action.icon, run: () => cmd(action.run) })),
  ]
})
</script>

<template>
  <Strip>
    <FormattingToolbar v-if="mode === 'editable' && canSave" :actions="actions" />
    <template #actions>
      <Dropdown>
        <template #trigger><IconButton icon="lu:ellipsis-vertical" tooltip="Document tools" :disabled="!canSave" /></template>
        <MenuItem value="find" @select="emit('find')">Find in document</MenuItem>
        <MenuItem value="outline" @select="emit('outline')">Document outline</MenuItem>
        <MenuItem v-if="links" value="backlinks" @select="emit('backlinks')">Backlinks</MenuItem>
        <MenuItem v-if="links" value="copy-block-link" @select="emit('copyLink')">Copy link to block</MenuItem>
        <MenuItem v-if="hasHistory" value="versions" @select="emit('versions')">Saved versions</MenuItem>
      </Dropdown>
      <Dropdown>
        <template #trigger>
          <Button variant="ghost" :disabled="busy" :aria-label="`Editor mode: ${modeLabel}`">{{ modeLabel }}</Button>
        </template>
        <MenuItem v-for="item in modes" :key="item.value" :value="item.value" :title="item.description" @select="selectMode(item.value)">{{ item.label }}</MenuItem>
      </Dropdown>
      <Button v-if="mode !== 'readonly'" variant="secondary" :disabled="!canSave" @click="onSave?.()">Save</Button>
    </template>
  </Strip>
  <LinkDialog v-if="linkOpen && view && mode === 'editable'" :view="view" :links="links" :path="path" @close="linkOpen = false" />
</template>
