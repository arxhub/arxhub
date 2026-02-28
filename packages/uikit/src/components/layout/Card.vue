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
  background-color: var(--gray-2);
  display: flex;
  flex-direction: column;
  min-height: 350px;
}

.card-header {
  height: var(--size-sm);
  padding: 0 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--gray-6);
  background-color: var(--gray-1);
  flex-shrink: 0;
}

.title-wrapper {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-widest);
  color: var(--gray-11);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.title {
  line-height: var(--line-height-none);
}

.copy-btn {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--gray-11);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--duration-normal);
}

.copy-btn:hover {
  background-color: var(--gray-3);
  color: var(--accent-9);
}

.card-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}
</style>
