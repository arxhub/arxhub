<script setup lang="ts">
import { t } from '../i18n/messages'
import BottomSheet from './BottomSheet.vue'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <BottomSheet open :title="title" :close-label="t('inspector.close')" @close="emit('close')">
    <div class="inspector-body"><p v-if="subtitle" class="inspector-subtitle">{{ subtitle }}</p><slot /></div>
  </BottomSheet>
</template>
<style scoped>
.inspector-body { padding: 12px; }
.inspector-subtitle { margin: 0 0 12px; font-size: var(--font-size-sm); color: var(--gray-11); overflow-wrap: anywhere; }
</style>
