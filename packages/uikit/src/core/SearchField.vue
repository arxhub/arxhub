<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'
import IconButton from './IconButton.vue'
import Input from './Input.vue'

// Attributes and listeners reach the <input> itself, not the wrapper: a consumer's @keydown (arrow into a
// result list, Escape to reset) has to fire where the caret is.
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  placeholder?: string
  ariaLabel?: string
  autofocus?: boolean
  disabled?: boolean
}>()

const touch = useShellFrame() === 'mobile'
const root = ref<HTMLElement | null>(null)
const clearable = computed(() => model.value !== '' && !props.disabled)

// querySelector rather than a template ref on <Input>: the ref would be the component, and reaching
// through it for the element it renders needs a cast that strict mode has no honest form for.
function focus(): void {
  root.value?.querySelector('input')?.focus()
}

function clear(): void {
  model.value = ''
  focus()
}

onMounted(() => {
  if (props.autofocus) focus()
})

defineExpose({ focus })
</script>

<template>
  <div ref="root" class="search-field" :class="{ touch }">
    <span class="search-icon" :class="{ disabled }"><Icon name="lu:search" :size="touch ? 16 : 14" /></span>
    <Input
      v-model="model"
      icon-start
      :icon-end="clearable"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :disabled="disabled"
      v-bind="$attrs"
    />
    <IconButton v-if="clearable" class="search-clear" :size="touch ? 'md' : 'sm'" icon="lu:x" aria-label="Clear search" @click="clear" />
  </div>
</template>

<style scoped>
.search-field {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 8px;
  display: inline-flex;
  color: var(--gray-10);
  pointer-events: none;
}

.search-icon.disabled {
  color: var(--gray-9);
}

.search-clear {
  position: absolute;
  right: 4px;
}

.search-field.touch .search-icon {
  left: 12px;
}

.search-field.touch .search-clear {
  right: 8px;
}
</style>
