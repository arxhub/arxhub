<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'

defineProps<{
  icon?: string
  text?: string
  hint?: string
  // Stands in for a whole region (a panel, a stage) rather than for a list inside one: it takes the
  // room it is given and centres itself in it, instead of sitting at the top.
  fill?: boolean
  // A note under a section heading or inside a small list (a picker, a sheet's section): the same
  // message with the vertical room of one row rather than of a whole region.
  compact?: boolean
}>()

const touch = useShellFrame() === 'mobile'
</script>

<template>
  <div class="empty-state" :class="{ touch, fill, compact }">
    <Icon v-if="icon" :name="icon" :size="20" />
    <p class="empty-text"><slot>{{ text }}</slot></p>
    <p v-if="hint || $slots.hint" class="empty-hint"><slot name="hint">{{ hint }}</slot></p>
    <div v-if="$slots.actions" class="empty-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--gray-11);
  font-family: var(--font-sans);
  text-align: center;
}

.empty-state.fill {
  flex: 1;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.empty-state.compact {
  gap: 4px;
  padding: 12px 8px;
}

.empty-text,
.empty-hint {
  margin: 0;
  max-width: 48ch;
  line-height: var(--line-height-relaxed);
}

.empty-text {
  font-size: var(--font-size-sm);
}

.empty-hint {
  color: var(--gray-10);
  font-size: var(--font-size-xs);
}

.empty-state.touch .empty-text {
  font-size: var(--font-size-md);
}

.empty-state.touch .empty-hint {
  font-size: var(--font-size-sm);
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}
</style>
