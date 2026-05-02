<script setup lang="ts">
import { computed } from 'vue'
import { usePanels } from '../use-panels'
import LayoutRenderer from './LayoutRenderer.vue'

const store = usePanels()
const layout = computed(() => store.layout.value)
</script>

<template>
  <div class="panels-layout">
    <LayoutRenderer v-if="layout" :node="layout" />
    <div v-else class="panels-empty">
      <p>No panels open</p>
    </div>
  </div>
</template>

<style scoped>
.panels-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gray-8);
  font-size: var(--font-size-sm);
}
</style>
