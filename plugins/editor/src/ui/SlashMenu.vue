<script setup lang="ts">
import { Icon, Row } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { type BlockCommand, matchingCommands, runSlashCommand, type SlashMenuState } from '../slash-commands'

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
const matches = computed(() => matchingCommands(props.menu.query, props.commands))
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
  <div ref="list" class="slash-menu" role="listbox" aria-label="Insert block" :id="menuId" :style="position" @mousedown.prevent>
    <Row
      v-for="(command, index) in matches"
      :key="command.id"
      :id="`${menuId}-${command.id}`"
      as="button"
      role="option"
      :aria-selected="index === menu.index"
      :selected="index === menu.index"
      @click="runSlashCommand(view.state, view.dispatch, command); view.focus()"
    >
      <Icon :name="command.icon" />{{ command.label }}
    </Row>
    <span v-if="!matches.length" class="slash-empty">No matching blocks</span>
  </div>
  </Teleport>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: var(--z-index-dropdown);
  width: 272px;
  max-width: calc(100vw - 16px);
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  box-shadow: var(--shadow-md);
}
.slash-empty { display: block; padding: 8px; color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
