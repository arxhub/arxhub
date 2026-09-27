<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { EmptyState, Icon, Row, ScrollArea } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n/messages'
import { type BlockCommand, canRunSlashCommand, matchingCommands, runSlashCommand, type SlashMenuState } from '../slash-commands'

const props = defineProps<{ view: EditorView; menu: SlashMenuState; menuId: string; commands: readonly BlockCommand[] }>()
const list = ref<HTMLElement>()
const viewportRevision = ref(0)
const resize = () => {
  viewportRevision.value++
}
onMounted(() => {
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('scroll', resize)
})
onUnmounted(() => {
  window.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('scroll', resize)
})
// Read per menu state, not per view: the menu state is rebuilt by every transaction while it is open,
// so a row's availability follows the document without watching the (non-reactive) view.
const matches = computed(() =>
  matchingCommands(props.menu.query, props.commands).map((command) => ({ command, disabled: !canRunSlashCommand(props.view.state, command) })),
)
const position = computed(() => {
  void viewportRevision.value
  const rect = props.view.coordsAtPos(props.menu.from)
  const viewport = window.visualViewport
  const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
  const top = viewport?.offsetTop ?? 0
  const height = Math.max(48, Math.min(288, bottom - top - 16))
  return {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 288))}px`,
    top: `${Math.max(top + 8, Math.min(rect.bottom + 4, bottom - height - 8))}px`,
    maxHeight: `${height}px`,
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
  <ScrollArea>
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
      @click="runSlashCommand(view.state, view.dispatch, command); view.focus()"
    >
      <Icon :name="command.icon" />{{ readText(command.label) }}
    </Row>
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
  width: 272px;
  max-width: calc(100vw - 16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  box-shadow: var(--shadow-md);
}
.slash-list { padding: 4px; }
</style>
