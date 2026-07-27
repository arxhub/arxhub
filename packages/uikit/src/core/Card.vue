<script setup lang="ts">
import Icon from './Icon.vue'
import SectionLabel from './SectionLabel.vue'

defineProps<{
  title?: string
  icon?: string
  // Micro-label above the title, naming the class of card rather than its subject ("Irreversible").
  label?: string
  variant?: 'default' | 'danger'
}>()
</script>

<template>
  <div class="card" :class="variant ?? 'default'">
    <SectionLabel v-if="label" :tone="variant === 'danger' ? 'danger' : 'muted'" class="card-label">
      {{ label }}
    </SectionLabel>
    <div v-if="title || $slots.actions" class="card-header">
      <div class="title-wrapper">
        <Icon v-if="icon" :name="icon" :size="14" />
        <span v-if="title" class="title">{{ title }}</span>
      </div>
      <div v-if="$slots.actions" class="card-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="card-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background-color: var(--gray-2);
  font-family: var(--font-sans);
}

.card.danger {
  border-color: var(--danger-6);
  background-color: var(--danger-2);
}

.card-label {
  margin-bottom: 4px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}

.title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gray-12);
}

.title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-tight);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}
</style>
