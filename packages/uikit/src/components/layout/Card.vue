<script setup lang="ts">
import Icon from '../ui/Icon.vue'

defineProps<{
  title: string
}>()
</script>

<template>
  <div class="card">
    <div class="card-header">
      <div class="title-wrapper">
        <Icon name="text_fields" :size="14" />
        <span class="title">{{ title }}</span>
      </div>
      <button class="copy-btn">
        <Icon name="content_copy" :size="14" />
      </button>
    </div>
    <div class="card-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.card {
  background-color: var(--radix-gray-2);
  display: flex;
  flex-direction: column;
  min-height: 350px;
}

.card-header {
  height: 2.25rem; /* h-9 */
  padding: 0 0.75rem; /* px-3 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-cold);
  background-color: var(--radix-gray-1);
  flex-shrink: 0;
}

.title-wrapper {
  font-size: 0.625rem; /* text-[10px] */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em; /* tracking-widest */
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem; /* gap-2 */
}

.title {
  line-height: 1;
}

.copy-btn {
  width: 1.5rem; /* size-6 */
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background-color: var(--radix-gray-3);
  color: var(--primary);
}

.card-content {
  padding: 1.5rem; /* p-6 */
  display: flex;
  flex-direction: column;
  gap: 1rem; /* space-y-4 */
  flex: 1;
}
</style>
