<script setup lang="ts">
import { PinEntry } from '@arxhub/plugin-keystore/ui'
import { computed } from 'vue'
import type { SecurityTask } from '../../security/security-task'

// One code on screen at a time: the code asked for again, a new one, or its repeat. Six digits submit
// themselves; a lock set before that rule takes any length and keeps a confirm key.
const props = defineProps<{ task: SecurityTask; text: string; label: string; testId: string }>()

defineEmits<{ submit: [] }>()

const length = computed(() => props.task.codeLength ?? undefined)
const invalid = computed(() => props.task.error.value != null && props.task.code.value === '')
</script>

<template>
  <p class="text">{{ text }}</p>
  <PinEntry
    :key="`${task.step.value}:${task.refusals.value}`"
    :model-value="task.code.value"
    :label="label"
    :length="length"
    :confirm-label="length == null ? 'Next' : undefined"
    :autocomplete="task.step.value === 'reentry' ? 'current-password' : 'new-password'"
    autofocus
    :disabled="task.busy.value || task.paused.value"
    :error="task.shownError.value"
    :invalid="invalid"
    :test-id="testId"
    @update:model-value="task.input($event)"
    @submit="$emit('submit')"
  />
</template>

<style scoped>
.text {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
