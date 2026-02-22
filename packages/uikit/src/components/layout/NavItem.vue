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
  width: 2.5rem; /* size-10 */
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-muted);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-item:hover {
  background-color: var(--radix-gray-3);
  color: var(--text-main);
}

.nav-item.active {
  background-color: var(--primary-dim);
  color: var(--primary);
  border-color: rgba(53, 158, 255, 0.2); /* primary/20 */
}
</style>
