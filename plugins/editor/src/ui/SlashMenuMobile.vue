<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { BottomSheet, EmptyState, SearchField, TileGrid } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/messages'
import { type BlockCommand, canRunSlashCommand, matchingCommands, runSlashCommand, type SlashMenuState, slashKey } from '../slash-commands'

const props = defineProps<{ view: EditorView; menu: SlashMenuState; menuId: string; commands: readonly BlockCommand[] }>()
// Seeded from what was typed after "/", then the sheet's own: the keyboard is down while the grid is up,
// and typing into the field must not write into the document behind the sheet.
const filter = ref(props.menu.query)
const open = ref(false)
const highlighted = ref<string>()
// Enter in the field always takes the highlighted tile, but it is only drawn once the owner has steered —
// typed a filter or moved with the arrows. A sheet that opens with one kind already lit reads as a choice made.
const steered = ref(false)
const shown = computed(() => (steered.value || filter.value !== '' ? highlighted.value : undefined))

const matches = computed(() =>
  matchingCommands(filter.value, props.commands).map((command) => ({ command, disabled: !canRunSlashCommand(props.view.state, command) })),
)
const tiles = computed(() =>
  matches.value.map(({ command, disabled }) => ({ id: command.id, label: readText(command.label), icon: command.icon, disabled })),
)
const runnable = computed(() => matches.value.filter((match) => !match.disabled).map((match) => match.command))
watch(
  runnable,
  (commands) => {
    if (!commands.some((command) => command.id === highlighted.value)) highlighted.value = commands[0]?.id
  },
  { immediate: true },
)

onMounted(() => {
  // Focus is about to move into the sheet; without the hold that blur would end the menu under it.
  props.view.dispatch(props.view.state.tr.setMeta(slashKey, 'hold'))
  open.value = true
})

// The sheet traps focus until it is gone, so the document takes it back once the sheet has closed — still
// inside the tap's activation, which is what lets the phone raise the keyboard for the new block.
async function refocus(view: EditorView): Promise<void> {
  open.value = false
  await nextTick()
  if (!view.isDestroyed) view.focus()
}

function select(id: string | undefined): void {
  const view = props.view
  const command = props.commands.find((entry) => entry.id === id)
  if (command && runSlashCommand(view.state, view.dispatch, command)) void refocus(view)
}

function dismiss(): void {
  const view = props.view
  if (view.isDestroyed) return
  view.dispatch(view.state.tr.setMeta(slashKey, 'dismiss'))
  void refocus(view)
}

function onFieldKeydown(event: KeyboardEvent): void {
  const list = runnable.value
  const at = list.findIndex((command) => command.id === highlighted.value)
  if (event.key === 'Enter') {
    event.preventDefault()
    select(highlighted.value)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    steered.value = true
    if (list.length) highlighted.value = list[(at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.id
  }
}
</script>

<template>
  <BottomSheet :open="open" :title="t('blockMenu.insert')" :restore-focus="false" @close="dismiss">
    <TileGrid v-if="tiles.length" :id="menuId" :items="tiles" :active-id="shown" :label="t('blockMenu.insert')" @select="select" @highlight="highlighted = $event" />
    <EmptyState v-else compact icon="lu:search-x" :text="t('slash.empty')" />
    <template #footer>
      <SearchField v-model="filter" flush aria-label="Filter blocks" placeholder="Filter blocks" @keydown="onFieldKeydown" />
    </template>
  </BottomSheet>
</template>
