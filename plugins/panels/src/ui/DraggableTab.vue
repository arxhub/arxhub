<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import { ref } from 'vue'
import { useDraggableTab } from '../composables/use-draggable-tab'
import TabDropIndicator from './TabDropIndicator.vue'

const props = defineProps<{
  instanceId: string
  groupId: string
  index: number
  title: string
  isActive: boolean
  isPreview: boolean
}>()

const emit = defineEmits<{
  click: []
  close: []
  promote: []
}>()

const tabEl = ref<HTMLElement | null>(null)

const { isDragging, closestEdge } = useDraggableTab({
  el: tabEl,
  getData: () => ({ instanceId: props.instanceId, groupId: props.groupId, index: props.index }),
})
</script>

<template>
  <div
    ref="tabEl"
    role="button"
    tabindex="0"
    class="tab"
    :class="{ active: isActive, 'is-dragging': isDragging, preview: isPreview }"
    @click="emit('click')"
    @dblclick="emit('promote')"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <span class="tab-title">{{ title }}</span>
    <IconButton class="tab-close" icon="lu:x" size="xs" tooltip="Close" @click.stop="emit('close')" />
    <TabDropIndicator :edge="closestEdge" />
  </div>
</template>

<style scoped>
/* Tabs are pills inside the strip rather than full-height cells divided by rules: the active one is
   stated by its own fill, so the strip needs no vertical dividers and no accent underline. */
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 12px;
  height: 28px;
  max-width: 220px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.tab:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

/* A tab IS a selection, so it takes the app's one selection treatment — an accent wash plus accent
   text, no border. It used to state itself with a grey fill, which made the active document the only
   selected thing in the app that did not look selected: the tree row that opened it, the settings
   section beside it and the search result above it all read as accent. */
.tab.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab.preview .tab-title {
  font-style: italic;
}

.tab.is-dragging {
  background-color: transparent;
  color: transparent;
  border-color: var(--accent-7);
  border-style: dashed;
  opacity: 1;
}

.tab.is-dragging .tab-close {
  visibility: hidden;
}
</style>
