<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { useTemplateRef } from 'vue'
import DesktopPinEntry from './DesktopPinEntry.vue'
import MobilePinEntry from './MobilePinEntry.vue'
import type { PinEntryHandle, PinEntryProps } from './pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const Entry = useShellFrame() === 'mobile' ? MobilePinEntry : DesktopPinEntry
const entry = useTemplateRef<PinEntryHandle>('entry')
defineExpose({ focus: () => entry.value?.focus() })
</script>

<template>
  <component :is="Entry" ref="entry" v-bind="props" @update:model-value="emit('update:modelValue', $event)" @submit="emit('submit')" />
</template>
