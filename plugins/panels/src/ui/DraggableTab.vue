<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useDraggableTab } from '../composables/use-draggable-tab'
import TabDropIndicator from './TabDropIndicator.vue'

const props = defineProps<{
  instanceId: string
  groupId: string
  index: number
  title: string
  isActive: boolean
}>()

const emit = defineEmits<{
  click: []
  close: []
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
    :class="{ active: isActive, 'is-dragging': isDragging }"
    @click="emit('click')"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <span class="tab-title">{{ title }}</span>
    <button class="tab-close" aria-label="Close tab" @click.stop="emit('close')">
      <X :size="12" />
    </button>
    <TabDropIndicator :edge="closestEdge" />
  </div>
</template>

<style scoped>
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 36px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--gray-4);
  color: var(--gray-10);
  font-size: var(--font-size-sm);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.tab.active {
  background-color: var(--gray-1);
  color: var(--gray-12);
  border-bottom: 2px solid var(--accent-9);
}

.tab.is-dragging {
  background-color: transparent;
  color: transparent;
  border-color: var(--accent-7);
  border-bottom-style: dashed;
  border-right-style: dashed;
  opacity: 1;
}

.tab.is-dragging .tab-close {
  visibility: hidden;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: inherit;
  cursor: pointer;
  padding: 0;
  opacity: 0.5;
}

.tab-close:hover {
  background-color: var(--gray-5);
  opacity: 1;
}
</style>
