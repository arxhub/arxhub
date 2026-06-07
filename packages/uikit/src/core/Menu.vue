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
  <Menu.Root :positioning="{ placement }">
    <Menu.ContextTrigger v-if="trigger === 'context'" as-child>
      <slot name="trigger" />
    </Menu.ContextTrigger>
    <Menu.Trigger v-else as-child>
      <slot name="trigger" />
    </Menu.Trigger>

    <Teleport to="body">
      <Menu.Positioner>
        <Menu.Content class="menu-content">
          <slot />
        </Menu.Content>
      </Menu.Positioner>
    </Teleport>
  </Menu.Root>
</template>

<style scoped>
.menu-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 140px;
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
</style>
