<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Menu } from '@ark-ui/vue'
import type { Placement } from './placement'

withDefaults(
  defineProps<{
    trigger?: 'click' | 'context'
    placement?: Placement
  }>(),
  { trigger: 'click', placement: 'bottom-start' },
)
</script>

<template>
  <Menu.Root :positioning="{ placement, strategy: 'fixed' }">
    <Menu.ContextTrigger v-if="trigger === 'context'" as-child>
      <slot name="trigger" />
    </Menu.ContextTrigger>
    <Menu.Trigger v-else as-child>
      <slot name="trigger" />
    </Menu.Trigger>

    <Menu.Positioner>
      <Menu.Content class="menu-content">
        <slot />
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
     no more than that and scrolls instead. The fallback is for a menu rendered outside a positioner. */
  max-height: var(--available-height, 60vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: var(--z-index-dropdown);
}

.menu-content:focus {
  outline: none;
}

/* Author display styles override the browser's [hidden] rule while Ark keeps closed content mounted. */
.menu-content[hidden] {
  display: none;
}
</style>
