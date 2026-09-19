<script setup lang="ts">
import { PinEntry } from '@arxhub/plugin-keystore/ui'
import { Button } from '@arxhub/uikit/core'
import { ref } from 'vue'

defineProps<{ disabled?: boolean }>()
const currentCode = defineModel<string>('currentCode', { required: true })
const newCode = defineModel<string>('newCode', { required: true })
const emit = defineEmits<{ submit: [] }>()
const step = ref<'current' | 'new'>('current')

function next(): void {
  if (currentCode.value.length > 0) step.value = 'new'
}
</script>

<template>
  <div class="change-code">
    <PinEntry
      v-if="step === 'current'"
      key="current"
      v-model="currentCode"
      label="Current unlock code"
      autocomplete="current-password"
      :disabled="disabled"
      test-id="current-unlock-code"
      @submit="next"
    />
    <PinEntry
      v-else
      key="new"
      v-model="newCode"
      label="New unlock code"
      autocomplete="new-password"
      autofocus
      :disabled="disabled"
      test-id="new-unlock-code"
      @submit="emit('submit')"
    />
    <Button v-if="step === 'current'" size="lg" variant="secondary" :disabled="disabled || !currentCode" @click="next">Enter new code</Button>
    <Button v-else size="lg" variant="ghost" :disabled="disabled" @click="step = 'current'">Edit current code</Button>
  </div>
</template>

<style scoped>
.change-code {
  display: grid;
  gap: 8px;
}
</style>
