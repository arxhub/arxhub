<script setup lang="ts">
import { MIN_UNLOCK_CODE_LENGTH } from '@arxhub/plugin-keystore'
import { PinEntry } from '@arxhub/plugin-keystore/ui'

defineProps<{ disabled?: boolean }>()
const currentCode = defineModel<string>('currentCode', { required: true })
const newCode = defineModel<string>('newCode', { required: true })
const emit = defineEmits<{ submit: [] }>()
</script>

<template>
  <PinEntry
    v-model="currentCode"
    label="Current unlock code"
    placeholder="Current unlock code"
    autocomplete="current-password"
    :disabled="disabled"
    test-id="current-unlock-code"
  />
  <PinEntry
    v-model="newCode"
    label="New unlock code"
    :placeholder="`New code, ${MIN_UNLOCK_CODE_LENGTH}+ digits`"
    autocomplete="new-password"
    :disabled="disabled"
    test-id="new-unlock-code"
    @submit="emit('submit')"
  />
</template>
