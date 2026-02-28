<script setup lang="ts">
import Icon from '../ui/Icon.vue'

defineProps<{
  title: string
  icon: string
  active?: boolean
}>()
</script>

<template>
  <button 
    class="nav-item" 
    :class="{ active }"
    :title="title"
  >
    <Icon :name="icon" :size="20" />
  </button>
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
