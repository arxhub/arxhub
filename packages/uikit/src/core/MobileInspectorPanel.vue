<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import IconButton from './IconButton.vue'
import Strip from './Strip.vue'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <BottomSheet open :label="title" @close="emit('close')">
    <Strip :title="title" flush-actions><template #actions><IconButton size="xl" icon="lu:x" tooltip="Close settings" @click="emit('close')" /></template></Strip>
    <div class="inspector-body"><p v-if="subtitle" class="inspector-subtitle">{{ subtitle }}</p><slot /></div>
  </BottomSheet>
</template>
<style scoped>
.inspector-body { padding: 12px; }
.inspector-subtitle { margin: 0 0 12px; font-size: var(--font-size-sm); color: var(--gray-11); overflow-wrap: anywhere; }
</style>
