<script setup lang="ts">
import { Dialog } from '@ark-ui/vue'
import { ref, watch } from 'vue'
import { useBackStack } from '../hooks/useBackStack'
import { useKeyboardInset } from '../hooks/useKeyboardInset'

const props = withDefaults(defineProps<{ open: boolean; title?: string; label?: string; restoreFocus?: boolean }>(), { restoreFocus: true })
const emit = defineEmits<{ close: [] }>()

const sheetEl = ref<HTMLElement | null>(null)
const keyboardInset = useKeyboardInset()
const dragOffset = ref(0)
let startY: number | null = null
let opener: HTMLElement | null = null
watch(
  () => props.open,
  (open) => {
    if (open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    else {
      startY = null
      dragOffset.value = 0
    }
  },
  { flush: 'sync', immediate: true },
)
const finalFocus = () => (opener?.isConnected && opener.getClientRects().length ? opener : null)

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
  const height = sheetEl.value?.parentElement?.offsetHeight ?? 0
  if (dragOffset.value > height / 3) emit('close')
  startY = null
  dragOffset.value = 0
}
</script>

<template>
  <Dialog.Root :open="open" :restore-focus="restoreFocus" :final-focus-el="finalFocus" @update:open="$event || emit('close')">
    <Teleport to="body">
      <Dialog.Positioner v-if="open" class="sheet-backdrop" :style="{ bottom: `${keyboardInset}px` }" @click.self="emit('close')">
        <Dialog.Content
          class="sheet"
          :aria-label="label ?? title"
          :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"

        >
          <div
            class="grabber-area"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <div class="grabber" aria-hidden="true" />
            <Dialog.Title v-if="title" class="sheet-title">{{ title }}</Dialog.Title>
          </div>
          <div ref="sheetEl" class="sheet-body">
            <slot />
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Teleport>
  </Dialog.Root>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-index-modal);
  display: flex;
  align-items: flex-end;
  background: var(--scrim-modal);
}

.sheet {
  width: 100%;
  max-height: 80%;
  outline: none;
  display: flex;
  flex-direction: column;
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: var(--gray-1);
  color: var(--gray-12);
  /* The sheet is teleported to <body>, outside the frame that sets the app's font — so it has to set
     it itself, or every sheet in the app renders in the browser's default serif. */
  font-family: var(--font-sans);
  box-shadow: var(--shadow-xl);
}

.grabber-area {
  padding: 8px 16px;
  cursor: grab;
  /* Only the handle owns the vertical gesture; the body must stay scrollable. */
  touch-action: none;
}

.grabber {
  width: 36px;
  height: 4px;
  margin: 0 auto;
  border-radius: var(--radius-xs);
  background: var(--gray-7);
}

.sheet-title {
  margin: 8px 0 0;
  text-align: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-11);
}

.sheet-body {
  overflow-y: auto;
  padding: 0 0 max(8px, env(safe-area-inset-bottom));
}
</style>
