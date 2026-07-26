<script setup lang="ts">
import { ref } from 'vue'
import { useBackStack } from '../hooks/useBackStack'

const props = defineProps<{ open: boolean; title?: string; label?: string }>()
const emit = defineEmits<{ close: [] }>()

const sheetEl = ref<HTMLElement | null>(null)
const dragOffset = ref(0)
let startY: number | null = null

// Back closes the sheet instead of leaving the app — an overlay has no navigation of its own.
useBackStack(
  () => props.open,
  () => emit('close'),
)

function onPointerDown(event: PointerEvent): void {
  startY = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (startY == null) return
  dragOffset.value = Math.max(0, event.clientY - startY)
}

function onPointerUp(): void {
  if (startY == null) return
  // Past a third of the sheet the gesture reads as dismissal; below that it springs back.
  const height = sheetEl.value?.offsetHeight ?? 0
  if (dragOffset.value > height / 3) emit('close')
  startY = null
  dragOffset.value = 0
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
      <div
        ref="sheetEl"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="label ?? title"
        :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"
        @keydown.escape="emit('close')"
      >
        <div
          class="grabber-area"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div class="grabber" aria-hidden="true" />
          <p v-if="title" class="sheet-title">{{ title }}</p>
        </div>
        <div class="sheet-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-index-modal);
  display: flex;
  align-items: flex-end;
  background: var(--black-a4);
}

.sheet {
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: var(--gray-1);
  color: var(--gray-12);
  box-shadow: var(--shadow-xl);
}

.grabber-area {
  padding: 0.5rem 1rem;
  cursor: grab;
  /* Only the handle owns the vertical gesture; the body must stay scrollable. */
  touch-action: none;
}

.grabber {
  width: 2.25rem;
  height: 4px;
  margin: 0 auto;
  border-radius: var(--radius-xs);
  background: var(--gray-7);
}

.sheet-title {
  margin: 0.5rem 0 0;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--gray-11);
}

.sheet-body {
  overflow-y: auto;
  padding: 0.25rem 0 max(0.5rem, env(safe-area-inset-bottom));
}
</style>
