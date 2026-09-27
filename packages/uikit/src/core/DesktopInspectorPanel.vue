<script setup lang="ts">
import { t } from '../i18n/messages'
import IconButton from './IconButton.vue'
import ScrollArea from './ScrollArea.vue'
import Strip from './Strip.vue'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <aside class="inspector-panel" :aria-label="title" @keydown.esc.stop="emit('close')">
    <Strip :title="title" flush-actions><template #actions><IconButton size="lg" icon="lu:x" :tooltip="t('inspector.close')" @click="emit('close')" /></template></Strip>
    <ScrollArea class="inspector-body" content-class="inspector-content"><p v-if="subtitle" class="inspector-subtitle">{{ subtitle }}</p><slot /></ScrollArea>
  </aside>
</template>
<style scoped>
.inspector-panel { flex: 0 0 320px; width: 320px; max-width: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--gray-2); border-left: 1px solid var(--gray-6); box-sizing: border-box; z-index: 2; }
.inspector-body :deep(.inspector-content) { padding: 12px; }
.inspector-subtitle { margin: 0 0 12px; font-size: var(--font-size-xs); color: var(--gray-11); overflow-wrap: anywhere; }
/* A narrow split still gives the inspector usable controls without collapsing the document to zero. */
@container (max-width: 640px) { .inspector-panel { position: absolute; inset-block: 0; right: 0; box-shadow: var(--shadow-lg); } }
</style>
