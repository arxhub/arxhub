<script setup lang="ts">
import Icon from './Icon.vue'
import Tooltip from './Tooltip.vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  title: string
  icon: string
  active?: boolean
}>()
</script>

<template>
  <Tooltip :label="title" placement="right">
    <button
      class="nav-item"
      :class="{ active }"
      :aria-label="title"
      :aria-pressed="active || undefined"
      v-bind="$attrs"
    >
      <Icon :name="icon" :size="16" />
    </button>
  </Tooltip>
</template>

<style scoped>
.nav-item {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  background-color: transparent;
  color: var(--gray-11);
  border: none;
  cursor: pointer;
  transition: background-color var(--duration-fast), color var(--duration-fast);
}

.nav-item:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.nav-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

/* Selection is the one place the accent is spent on chrome — a wash plus accent text, no border. */
.nav-item.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
}
</style>
