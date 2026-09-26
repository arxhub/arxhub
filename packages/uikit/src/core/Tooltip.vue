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
  <Tooltip.Root :open-delay="openDelay" :close-delay="closeDelay" :positioning="{ placement, strategy: 'fixed' }">
    <Tooltip.Trigger as-child>
      <slot />
    </Tooltip.Trigger>
    <Tooltip.Positioner class="tooltip-positioner">
      <Tooltip.Content class="tooltip-content">
        <slot name="content">{{ label }}</slot>
      </Tooltip.Content>
    </Tooltip.Positioner>
  </Tooltip.Root>
</template>

<style scoped>
/* A tooltip only says what is under the pointer; it is never a target. Chrome re-runs hover when layout
   moves under a resting cursor, so a label raised that way over the vault strip took the clicks meant for
   the key beneath it. */
.tooltip-positioner {
  pointer-events: none;
}

.tooltip-content {
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  font-family: var(--font-sans);
  color: var(--gray-1);
  background: var(--gray-12);
  border-radius: var(--radius-xs);
  box-shadow: var(--shadow-sm);
  z-index: var(--z-index-tooltip);
}
</style>
