<script setup lang="ts">
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { type Component, computed, ref } from 'vue'
import { typeLayerId, useHotkeysExtension } from './hotkeys'
import { provideStageVisible } from './type-stage'

const props = defineProps<{ view: Component; typeId: string; visible: boolean }>()

// One push for every type there will ever be. A type's layer is up while its stage is ON SCREEN rather
// than while it holds focus: a type is where you are, and clicking blank space parks focus on <body> —
// a type whose chords died on that would be a keyboard nobody could rely on. Only the active type's
// stage is displayed (v-show below), so "on screen" IS "this is the active type", and a chord declared
// by a type the person has left cannot fire however long its component stays mounted.
const stageEl = ref<HTMLElement | null>(null)
useHotkeyLayer(useHotkeysExtension(), { id: typeLayerId(props.typeId), kind: 'type' }, stageEl)

// Published here rather than in the stack above, because `provide` is per instance and this is the one
// component there is exactly one of per type.
provideStageVisible(computed(() => props.visible))
</script>

<template>
  <!-- v-show, never v-if: hiding a box keeps the scroll offset of everything inside it, and moving it
       out of the document — which is what KeepAlive does — does not. -->
  <div ref="stageEl" v-show="visible" class="type-stage">
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
