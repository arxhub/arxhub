<script setup lang="ts">
import { useId } from 'vue'

// A labelled control: the name above it, and under it either what went wrong or a hint. `for` names the
// control's own id when there is one control; without it the label names the group of controls inside.
const props = defineProps<{
  label: string
  for?: string
  hint?: string
  error?: string | null
}>()

const labelId = useId()
</script>

<template>
  <div class="field" :role="props.for ? undefined : 'group'" :aria-labelledby="props.for ? undefined : labelId">
    <label v-if="props.for" class="label" :for="props.for">{{ label }}</label>
    <div v-else :id="labelId" class="label">{{ label }}</div>
    <slot />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint,
.error {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}

.hint {
  color: var(--gray-11);
}

.error {
  color: var(--danger-11);
}
</style>
