<script setup lang="ts">
import { computed } from 'vue'
import { usePanels } from '../use-panels'
import PanelTabBar from './PanelTabBar.vue'
import PanelView from './PanelView.vue'

const props = defineProps<{
  groupId: string
}>()

const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

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
    <div class="panel-content">
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
</style>
