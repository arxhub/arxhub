<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import type { Placement } from './placement'
import Tooltip from './Tooltip.vue'

// inheritAttrs:false so consumer class/listeners land on the <button>, not the Tooltip wrapper.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    icon?: string
    size?: 'xs' | 'sm' | 'md' | 'lg'
    active?: boolean
    disabled?: boolean
    tooltip?: string
    tooltipPlacement?: Placement
    ariaLabel?: string
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { size: 'sm', type: 'button', tooltipPlacement: 'top' },
)

// One optical size across the set: a single-weight glyph at ~14px inside a larger hit box, so chrome
// icons read as labels rather than as buttons of their own.
const iconSize = computed(() => ({ xs: 12, sm: 14, md: 16, lg: 20 })[props.size])
</script>

<template>
  <Tooltip v-if="tooltip" :label="tooltip" :placement="tooltipPlacement">
    <button
      class="icon-button"
      :class="[`size-${size}`, { active }]"
      :type="type"
      :disabled="disabled"
      :aria-label="ariaLabel ?? tooltip"
      :aria-pressed="active || undefined"
      v-bind="$attrs"
    >
      <Icon v-if="icon" :name="icon" :size="iconSize" />
      <slot v-else />
    </button>
  </Tooltip>
  <button
    v-else
    class="icon-button"
    :class="[`size-${size}`, { active }]"
    :type="type"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :aria-pressed="active || undefined"
    v-bind="$attrs"
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
  border-radius: var(--radius-xs);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-none);
  cursor: pointer;
  transition: background-color var(--duration-fast), color var(--duration-fast);
}

.icon-button:hover:not(:disabled) {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.icon-button.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
}

.icon-button:disabled {
  color: var(--gray-9);
  cursor: not-allowed;
}

.icon-button:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.size-xs {
  width: 20px;
  height: 20px;
}

.size-sm {
  width: var(--size-xl-half);
  height: var(--size-xl-half);
}

.size-md {
  width: var(--size-2xs);
  height: var(--size-2xs);
}

.size-lg {
  width: var(--size-md);
  height: var(--size-md);
}
</style>
