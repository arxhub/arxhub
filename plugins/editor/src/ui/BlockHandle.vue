<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { openBlockMenu } from './block-menu'

const props = defineProps<{ view: EditorView; scroller: HTMLElement; revision: number }>()
const layoutRevision = ref(0)
const measure = () => {
  layoutRevision.value++
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(props.scroller)
  props.scroller.addEventListener('scroll', measure)
})
onUnmounted(() => {
  observer?.disconnect()
  props.scroller.removeEventListener('scroll', measure)
})
const position = computed(() => {
  void props.revision
  void layoutRevision.value
  const { $from } = props.view.state.selection
  const pos = $from.depth ? $from.before(1) : $from.pos
  const node = props.view.nodeDOM(pos)
  const panel = props.scroller.parentElement
  if (!(node instanceof HTMLElement) || !panel) return null
  const block = node.getBoundingClientRect()
  const scroll = props.scroller.getBoundingClientRect()
  const parent = panel.getBoundingClientRect()
  if (block.top < scroll.top || block.top + 32 > scroll.bottom) return null
  return { top: `${block.top - parent.top}px`, left: `${block.left - parent.left - 36}px` }
})
function open(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openBlockMenu(props.view, rect.left, rect.bottom)
}
</script>

<template>
  <div v-if="position" class="block-handle" :style="position" @mousedown.prevent>
    <IconButton icon="lu:grip-vertical" tooltip="Block actions" @click="open" />
  </div>
</template>

<style scoped>
.block-handle { position: absolute; }
</style>
