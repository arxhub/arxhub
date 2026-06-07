<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Tooltip } from '@ark-ui/vue'
import type { Placement } from './placement'

withDefaults(
  defineProps<{
    label?: string
    openDelay?: number
    closeDelay?: number
    placement?: Placement
  }>(),
  { openDelay: 300, closeDelay: 100, placement: 'top' },
)
</script>

<template>
  <Tooltip.Root :open-delay="openDelay" :close-delay="closeDelay" :positioning="{ placement }">
    <Tooltip.Trigger as-child>
      <slot />
    </Tooltip.Trigger>
    <Teleport to="body">
      <Tooltip.Positioner>
        <Tooltip.Content class="tooltip-content">
          <slot name="content">{{ label }}</slot>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Teleport>
  </Tooltip.Root>
</template>

<style scoped>
.tooltip-content {
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-1);
  background: var(--gray-12);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: var(--z-index-tooltip);
}
</style>
