<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Menu } from '@ark-ui/vue'

withDefaults(
  defineProps<{
    value: string
    disabled?: boolean
    variant?: 'default' | 'danger'
  }>(),
  { variant: 'default' },
)

const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <Menu.Item :value="value" :disabled="disabled" class="menu-item" :class="variant" @select="emit('select')">
    <slot />
  </Menu.Item>
</template>

<style scoped>
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-12);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}

.menu-item[data-highlighted] {
  background: var(--gray-4);
  outline: none;
}

.menu-item.danger {
  color: var(--red-9);
}

.menu-item.danger[data-highlighted] {
  background: var(--red-a3);
}

.menu-item[data-disabled] {
  opacity: 0.5;
  cursor: default;
}
</style>
