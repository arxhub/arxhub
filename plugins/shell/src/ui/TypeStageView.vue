<script setup lang="ts">
import { type Component, computed } from 'vue'
import { provideStageVisible } from './type-stage'

const props = defineProps<{ view: Component; visible: boolean }>()

// Published here rather than in the stack above, because `provide` is per instance and this is the one
// component there is exactly one of per type.
provideStageVisible(computed(() => props.visible))
</script>

<template>
  <!-- v-show, never v-if: hiding a box keeps the scroll offset of everything inside it, and moving it
       out of the document — which is what KeepAlive does — does not. -->
  <div v-show="visible" class="type-stage">
    <component :is="view" />
  </div>
</template>

<style scoped>
.type-stage {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
