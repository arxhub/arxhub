<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Dialog } from '@ark-ui/vue'
import { watch } from 'vue'
// biome-ignore lint/correctness/noUnusedImports: used in template
import Icon from './Icon.vue'
// biome-ignore lint/correctness/noUnusedImports: used in template
import Strip from './Strip.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    centered?: boolean
    size?: 'sm' | 'md' | 'lg'
    closeOnInteractOutside?: boolean
    closeOnEscape?: boolean
  }>(),
  { centered: false, size: 'md', closeOnInteractOutside: true, closeOnEscape: true },
)

let opener: HTMLElement | null = null
watch(
  () => props.open,
  (open) => {
    if (open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync', immediate: true },
)
const finalFocus = () => (opener?.isConnected && opener.getClientRects().length ? opener : null)

const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <Dialog.Root
    :open="open"
    :final-focus-el="finalFocus"
    :close-on-interact-outside="closeOnInteractOutside"
    :close-on-escape="closeOnEscape"
    @update:open="emit('update:open', $event)"
  >
    <Teleport to="body">
      <Dialog.Backdrop class="dialog-backdrop" />
      <Dialog.Positioner class="dialog-positioner" :class="{ centered }">
        <Dialog.Content class="dialog-content" :class="`size-${size}`">
          <Strip v-if="title || $slots.header">
            <template v-if="title" #title>
              <Dialog.Title class="dialog-title">{{ title }}</Dialog.Title>
            </template>
            <slot name="header" />
            <template #actions>
              <Dialog.CloseTrigger class="dialog-close" aria-label="Close">
                <Icon name="lu:x" :size="14" />
              </Dialog.CloseTrigger>
            </template>
          </Strip>
          <div class="dialog-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="dialog-footer">
            <slot name="footer" />
          </footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Teleport>
  </Dialog.Root>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: var(--scrim-modal);
  z-index: var(--z-index-overlay);
}

.dialog-positioner {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 10vh 1rem 1rem;
  z-index: var(--z-index-modal);
}

.dialog-positioner.centered {
  align-items: center;
  padding: 1rem;
}

/* The closed state has to win over the box. Ark marks the content `hidden` while the dialog is closed and
   leaves it mounted until the exit presence resolves; `[hidden]` from the browser's own sheet is an
   attribute selector, so it ties with this rule's class and loses to it — which left a closed dialog
   painted over the app. Nothing caught it while every dialog in the app was itself behind a `v-if`. */
.dialog-content[hidden] {
  display: none;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 85vh;
  overflow: hidden;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
}

.size-sm {
  max-width: 360px;
}

.size-md {
  max-width: 480px;
}

.size-lg {
  max-width: 640px;
}

/* The strip owns the box; this only undoes the heading's own margin. */
.dialog-title {
  margin: 0;
  font: inherit;
  color: inherit;
}

.dialog-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xl-half);
  height: var(--size-xl-half);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--gray-11);
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.dialog-close:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.dialog-body {
  padding: 16px;
  overflow-y: auto;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  font-family: var(--font-sans);
  color: var(--gray-12);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--gray-4);
}
</style>
