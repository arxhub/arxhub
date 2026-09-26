<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { EmptyState, placeFloating, Row, ScrollArea, Separator } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n/messages'
import { type BlockCommand, canRunSlashCommand, matchingCommands, runSlashCommand, type SlashMenuState } from '../slash-commands'

const props = defineProps<{ view: EditorView; menu: SlashMenuState; menuId: string; commands: readonly BlockCommand[] }>()
const WIDTH = 264
const MAX_HEIGHT = 288
const head = ref<HTMLElement>()
const list = ref<HTMLElement>()
// The menu's own height before any cap: what decides whether it fits under the caret line.
const natural = ref(0)
const viewportRevision = ref(0)
const resize = () => {
  viewportRevision.value++
}
let observer: ResizeObserver | null = null
function measure(): void {
  natural.value = (head.value?.offsetHeight ?? 0) + (list.value?.offsetHeight ?? 0) + 2
}
onMounted(() => {
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('scroll', resize)
  measure()
  observer = new ResizeObserver(measure)
  if (list.value) observer.observe(list.value)
})
onUnmounted(() => {
  window.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('scroll', resize)
  observer?.disconnect()
})
// Read per menu state, not per view: the menu state is rebuilt by every transaction while it is open,
// so a row's availability follows the document without watching the (non-reactive) view.
const matches = computed(() =>
  matchingCommands(props.menu.query, props.commands).map((command) => ({ command, disabled: !canRunSlashCommand(props.view.state, command) })),
)
// Under the caret line, or above it when it does not fit there — never over the line being typed.
const position = computed(() => {
  void viewportRevision.value
  const caret = props.view.coordsAtPos(props.menu.from)
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0
  const top = viewport?.offsetTop ?? 0
  const bounds = { left, top, right: left + (viewport?.width ?? window.innerWidth), bottom: top + (viewport?.height ?? window.innerHeight) }
  const placed = placeFloating(caret, { width: WIDTH, height: natural.value }, bounds, { maxHeight: MAX_HEIGHT })
  return {
    left: `${placed.x}px`,
    top: `${placed.y}px`,
    maxHeight: `${placed.maxHeight}px`,
    visibility: natural.value ? undefined : ('hidden' as const),
  }
})

watch(
  () => props.menu.index,
  async () => {
    await nextTick()
    list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <Teleport to="body">
  <div class="slash-menu" :style="position" @mousedown.prevent>
  <!-- What is typed after "/" is the filter; it stays in the document, so the caret never leaves the text. -->
  <div ref="head" class="slash-head">
    <Row plain icon="lu:search"><span :class="{ placeholder: !menu.query }">{{ menu.query ? `/${menu.query}` : 'Type to filter' }}</span></Row>
    <Separator orientation="horizontal" />
  </div>
  <ScrollArea class="slash-area">
  <div ref="list" class="slash-list" role="listbox" :aria-label="t('blockMenu.insert')" :id="menuId">
    <Row
      v-for="({ command, disabled }, index) in matches"
      :key="command.id"
      :id="`${menuId}-${command.id}`"
      as="button"
      role="option"
      :aria-selected="index === menu.index"
      :aria-disabled="disabled || undefined"
      :selected="index === menu.index"
      :disabled="disabled"
      :icon="command.icon"
      :label="readText(command.label)"
      :hint="command.shortcut"
      @click="runSlashCommand(view.state, view.dispatch, command); view.focus()"
    />
    <EmptyState v-if="!matches.length" compact icon="lu:search-x" :text="t('slash.empty')" />
  </div>
  </ScrollArea>
  </div>
  </Teleport>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: var(--z-index-dropdown);
  width: 264px;
  max-width: calc(100vw - 16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  box-shadow: var(--shadow-md);
}
.slash-head { flex: none; padding: 4px 4px 0; display: flex; flex-direction: column; gap: 4px; }
.slash-area { min-height: 0; }
.slash-list { padding: 4px; }
.placeholder { color: var(--gray-10); }
</style>
