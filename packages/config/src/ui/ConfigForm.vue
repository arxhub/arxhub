<script setup lang="ts">
import { Button, Input, Switch } from '@arxhub/uikit/core'
import type { TObject } from '@sinclair/typebox'
import { reactive, watch } from 'vue'

const props = defineProps<{
  schema: TObject
  values: Record<string, unknown>
}>()

const emit = defineEmits<{
  save: [data: Record<string, unknown>]
}>()

const local = reactive<Record<string, unknown>>({})

watch(
  () => props.values,
  (v) => Object.assign(local, v),
  { immediate: true },
)

function onSave() {
  emit('save', { ...local })
}
</script>

<template>
  <form class="config-form" @submit.prevent="onSave">
    <div v-for="(field, key) in schema.properties" :key="key" class="field">
      <label class="label">{{ field.title ?? key }}</label>

      <Switch
        v-if="field.type === 'boolean'"
        :model-value="(local[key] as boolean)"
        @update:model-value="local[key] = $event"
      />
      <Input
        v-else-if="field.type === 'number'"
        type="number"
        :model-value="String(local[key] ?? '')"
        @update:model-value="local[key] = Number($event)"
      />
      <Input
        v-else
        :model-value="(local[key] as string) ?? ''"
        @update:model-value="local[key] = $event"
      />
    </div>

    <Button type="submit" variant="primary" size="sm" class="save-btn">Save</Button>
  </form>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.label {
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  font-family: var(--font-sans);
}

.save-btn {
  align-self: flex-start;
  margin-top: 0.5rem;
}
</style>
