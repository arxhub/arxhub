<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Menu } from '@ark-ui/vue'
import { ref } from 'vue'
import type { Placement } from './placement'
// biome-ignore lint/style/useImportType: the template renders it; the script only names its type
import ScrollArea from './ScrollArea.vue'

withDefaults(
  defineProps<{
    trigger?: 'click' | 'context'
    placement?: Placement
  }>(),
  { trigger: 'click', placement: 'bottom-start' },
)

const area = ref<InstanceType<typeof ScrollArea> | null>(null)
// Ark reveals a keyboard-highlighted item by scrolling Menu.Content, and only while Menu.Content is
// itself the scroller. The scroller is the ScrollArea's viewport now, so the reveal is done here —
// and, as Ark does, never for a highlight the pointer made: the item under the pointer is in view.
let pointerDriven = false
function setPointerDriven(value: boolean) {
  pointerDriven = value
}
function reveal(value: string | null) {
  const viewport = area.value?.viewport
  if (pointerDriven || value == null || viewport == null) return
  viewport.querySelector(`[data-part="item"][data-value="${CSS.escape(value)}"]`)?.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <Menu.Root :positioning="{ placement, strategy: 'fixed' }" @highlight-change="reveal($event.highlightedValue)">
    <Menu.ContextTrigger v-if="trigger === 'context'" as-child>
      <slot name="trigger" />
    </Menu.ContextTrigger>
    <Menu.Trigger v-else as-child>
      <slot name="trigger" />
    </Menu.Trigger>

    <Menu.Positioner>
      <Menu.Content class="menu-content" @pointermove="setPointerDriven(true)" @keydown="setPointerDriven(false)">
        <ScrollArea ref="area" class="menu-area" viewport-class="menu-viewport" content-class="menu-list">
          <slot />
        </ScrollArea>
      </Menu.Content>
    </Menu.Positioner>
  </Menu.Root>
</template>

<style scoped>
.menu-content {
  display: flex;
  flex-direction: column;
  min-width: 168px;
  /* A menu taller than the room its trigger leaves used to run off the screen, and an item outside the
     viewport cannot be tapped at all — not scrolled to, not reached. The positioner publishes how much
     room there is (it measures the VISUAL viewport, so the on-screen keyboard counts); the menu takes
     no more than that and its ScrollArea scrolls instead. The fallback is for a menu rendered outside a
     positioner. */
  max-height: var(--available-height, 60vh);
  overflow: hidden;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: var(--z-index-dropdown);
}

.menu-area :deep(.menu-viewport) {
  overscroll-behavior: contain;
}

.menu-area :deep(.menu-list) {
  display: flex;
  flex-direction: column;
  padding: 4px;
}

.menu-content:focus {
  outline: none;
}

/* Author display styles override the browser's [hidden] rule while Ark keeps closed content mounted. */
.menu-content[hidden] {
  display: none;
}
</style>
