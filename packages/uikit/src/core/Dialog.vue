<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Dialog } from '@ark-ui/vue'
// biome-ignore lint/correctness/noUnusedImports: used in template
import Icon from './Icon.vue'

withDefaults(
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

const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <Dialog.Root
    :open="open"
    :close-on-interact-outside="closeOnInteractOutside"
    :close-on-escape="closeOnEscape"
    @update:open="emit('update:open', $event)"
  >
    <Teleport to="body">
      <Dialog.Backdrop class="dialog-backdrop" />
      <Dialog.Positioner class="dialog-positioner" :class="{ centered }">
        <Dialog.Content class="dialog-content" :class="`size-${size}`">
          <header v-if="title || $slots.header" class="dialog-header">
            <Dialog.Title v-if="title" class="dialog-title">{{ title }}</Dialog.Title>
            <slot name="header" />
            <Dialog.CloseTrigger class="dialog-close" aria-label="Close">
              <Icon name="lu:x" :size="16" />
            </Dialog.CloseTrigger>
          </header>
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
  background: var(--black-a6, rgba(0, 0, 0, 0.5));
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

.dialog-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 85vh;
  overflow: hidden;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
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

.dialog-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--gray-4);
}

.dialog-title {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.dialog-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xl-half);
  height: var(--size-xl-half);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--gray-11);
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.dialog-body {
  padding: 1rem;
  overflow-y: auto;
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  color: var(--gray-12);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--gray-4);
}
</style>
