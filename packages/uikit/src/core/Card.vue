<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'
import SectionLabel from './SectionLabel.vue'

defineProps<{
  title?: string
  icon?: string
  // Micro-label above the title, naming the class of card rather than its subject ("Irreversible").
  label?: string
  variant?: 'default' | 'warning' | 'danger'
  // A statement rather than a panel: one warning read in passing ("Write it on paper…"). The tone's wash
  // with no border, and the glyph on the first line of a title that wraps. Only the title is drawn.
  notice?: boolean
}>()

// DS-8: the glyph follows the frame, as a button's does — 16 beside touch-sized text, 14 otherwise.
const glyph = useShellFrame() === 'mobile' ? 16 : 14
</script>

<template>
  <div class="card" :class="[variant ?? 'default', { notice }]">
    <SectionLabel v-if="label" :tone="variant === 'danger' ? 'danger' : 'muted'" class="card-label">
      {{ label }}
    </SectionLabel>
    <div v-if="title || $slots.actions" class="card-header">
      <div class="title-wrapper">
        <Icon v-if="icon" :name="icon" :size="glyph" />
        <span v-if="title" class="title">{{ title }}</span>
      </div>
      <div v-if="$slots.actions" class="card-actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="card-content">
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

.card.warning {
  border-color: var(--warning-6);
  background-color: var(--warning-2);
}

.card.warning .title-wrapper {
  color: var(--warning-12);
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
  min-height: var(--size-md-half);
}

.title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gray-12);
}

/* A title that wraps must not squeeze its glyph: the icon is a fixed size (DS-8), never a flex share. */
.title-wrapper > :deep(svg),
.title-wrapper > :deep(.icon-glyph) {
  flex-shrink: 0;
}

.card.notice {
  padding: 12px;
  border-color: transparent;
}

.card.notice.warning {
  background-color: var(--warning-3);
}

.card.notice.danger {
  background-color: var(--danger-3);
}

.card.notice .card-header {
  min-height: 0;
}

.card.notice .title-wrapper {
  align-items: flex-start;
}

.card.notice .title-wrapper > :deep(*:first-child) {
  margin-top: 2px;
}

.card.notice .title {
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-normal);
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
