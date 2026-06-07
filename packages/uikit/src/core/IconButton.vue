<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    icon?: string
    size?: 'xs' | 'sm' | 'md'
    active?: boolean
    disabled?: boolean
    title?: string
    ariaLabel?: string
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { size: 'sm', type: 'button' },
)

const iconSize = computed(() => ({ xs: 12, sm: 16, md: 20 })[props.size])
</script>

<template>
  <button
    class="icon-button"
    :class="[`size-${size}`, { active }]"
    :type="type"
    :disabled="disabled"
    :title="title"
    :aria-label="ariaLabel ?? title"
    :aria-pressed="active || undefined"
  >
    <Icon v-if="icon" :name="icon" :size="iconSize" />
    <slot v-else />
  </button>
</template>

<style scoped>
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--duration-normal);
}

.icon-button:hover:not(:disabled) {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.icon-button.active {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon-button:focus-visible {
  outline: 2px solid var(--accent-9);
  outline-offset: -1px;
}

.size-xs {
  width: var(--size-xs-half);
  height: var(--size-xs-half);
}

.size-sm {
  width: var(--size-xl-half);
  height: var(--size-xl-half);
}

.size-md {
  width: var(--size-xs);
  height: var(--size-xs);
}
</style>
