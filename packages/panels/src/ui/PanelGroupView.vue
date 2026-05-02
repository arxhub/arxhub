<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { usePanels } from '../use-panels'
import PanelTabBar from './PanelTabBar.vue'
import PanelView from './PanelView.vue'

const props = defineProps<{
  groupId: string
}>()

const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

const panelContentEl = ref<HTMLElement | null>(null)
const isDragOver = ref(false)
let cleanup: (() => void) | null = null

onMounted(() => {
  if (!panelContentEl.value) return
  cleanup = dropTargetForElements({
    element: panelContentEl.value,
    canDrop: ({ source }) =>
      source.data.type === 'panel-tab' && source.data.groupId !== props.groupId,
    getData: () => ({ type: 'panel-group-body', groupId: props.groupId }),
    onDragEnter: () => { isDragOver.value = true },
    onDragLeave: () => { isDragOver.value = false },
    onDrop: () => { isDragOver.value = false },
  })
})

onUnmounted(() => { cleanup?.() })

function onClick() {
  store.activateGroup(props.groupId)
}
</script>

<template>
  <div
    class="panel-group-view"
    :class="{ 'is-active': isActiveGroup }"
    @click="onClick"
  >
    <PanelTabBar :group-id="groupId" />
    <div
      ref="panelContentEl"
      class="panel-content"
      :class="{ 'is-drag-over': isDragOver }"
    >
      <PanelView
        v-for="instance in group?.instances"
        :key="instance.instanceId"
        :instance="instance"
        :is-active="instance.instanceId === group?.activeInstanceId"
      />
    </div>
  </div>
</template>

<style scoped>
.panel-group-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid transparent;
}

.panel-group-view.is-active {
  border-color: var(--accent-7);
}

.panel-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.panel-content.is-drag-over {
  outline: 2px dashed var(--accent-7);
  outline-offset: -2px;
}
</style>
