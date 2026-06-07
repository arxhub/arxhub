<script setup lang="ts">
import { computed, provide } from 'vue'
import type { PanelInstance } from '../types'
import { PanelInstanceKey } from '../use-panel-instance'
import { usePanels } from '../use-panels'

const props = defineProps<{
  instance: PanelInstance
  isActive: boolean
  groupId: string
}>()

const store = usePanels()
const def = computed(() => store.getDefinition(props.instance.definitionId))

// Let the hosted panel component act on its own tab (e.g. promote preview → permanent on edit)
provide(PanelInstanceKey, {
  instanceId: props.instance.instanceId,
  groupId: props.groupId,
  promote: () => store.promotePanel(props.instance.instanceId, props.groupId),
})
</script>

<template>
  <div v-show="isActive" class="panel-view-instance">
    <component v-if="def" :is="def.component" v-bind="instance.props" />
  </div>
</template>

<style scoped>
.panel-view-instance {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
