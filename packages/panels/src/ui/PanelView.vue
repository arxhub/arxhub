<script setup lang="ts">
import { computed } from 'vue'
import { usePanels } from '../use-panels'
import type { PanelInstance } from '../types'

const props = defineProps<{
  instance: PanelInstance
  isActive: boolean
}>()

const store = usePanels()
const def = computed(() => store.getDefinition(props.instance.definitionId))
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
