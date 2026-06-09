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
      v-bind="$attrs"
    >
      <Icon :name="icon" :size="20" />
    </button>
  </Tooltip>
</template>

<style scoped>
.nav-item {
  width: var(--size-md);
  height: var(--size-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--gray-11);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-normal);
}

.nav-item:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.nav-item.active {
  background-color: var(--accent-3);
  color: var(--accent-9);
  border-color: var(--accent-a2);
}
</style>
