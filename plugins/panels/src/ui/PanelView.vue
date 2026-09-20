<script setup lang="ts">
import { type PanelChromeState, providePanelChrome } from '@arxhub/uikit/hooks'
import { computed, inject, shallowRef, watchEffect } from 'vue'
import type { PanelInstance } from '../types'
import { usePanels } from '../use-panels'
import { PanelChromeRegistryKey } from './panel-targets'

const props = defineProps<{
  instance: PanelInstance
  isActive: boolean
  groupId: string
}>()

const chrome = inject(PanelChromeRegistryKey, null)
if (chrome) {
  const state = shallowRef<PanelChromeState>({})
  providePanelChrome({ state, actions: computed(() => (props.isActive ? (chrome.actions.get(props.groupId) ?? null) : null)) })
  watchEffect((cleanup) => {
    const id = props.instance.instanceId
    chrome.states.set(id, state)
    cleanup(() => {
      if (chrome.states.get(id) === state) chrome.states.delete(id)
    })
  })
}
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
