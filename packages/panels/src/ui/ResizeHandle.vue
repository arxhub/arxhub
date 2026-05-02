<script setup lang="ts">
import { onUnmounted } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  resize: [ratio: number]
}>()

let cleanupDrag: (() => void) | null = null

onUnmounted(() => { cleanupDrag?.() })

// TODO: add touch support (touchstart / touchmove / touchend)
function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  const container: HTMLElement | null = (e.target as HTMLElement).parentElement
  if (!container) return

  const el: HTMLElement = container
  const isHorizontal = props.direction === 'horizontal'

  function onMouseMove(me: MouseEvent) {
    const rect = el.getBoundingClientRect()
    const ratio = isHorizontal
      ? (me.clientX - rect.left) / rect.width
      : (me.clientY - rect.top) / rect.height
    emit('resize', Math.max(0.1, Math.min(0.9, ratio)))
  }

  function cleanup() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    cleanupDrag = null
  }

  function onMouseUp() { cleanup() }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  cleanupDrag = cleanup
}
</script>

<template>
  <div
    class="resize-handle"
    :class="direction"
    @mousedown="onMouseDown"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  background-color: var(--gray-4);
  z-index: 1;
}

.resize-handle:hover,
.resize-handle:active {
  background-color: var(--accent-7);
}

.resize-handle.horizontal {
  width: 4px;
  height: 100%;
  cursor: col-resize;
}

.resize-handle.vertical {
  width: 100%;
  height: 4px;
  cursor: row-resize;
}
</style>
