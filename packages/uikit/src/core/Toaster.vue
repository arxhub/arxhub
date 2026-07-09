<script setup lang="ts">
import { Toaster as ArkToaster, ToastCloseTrigger, ToastDescription, ToastRoot, ToastTitle } from '@ark-ui/vue'
import { toaster } from '../hooks/useToast'
</script>

<template>
  <ArkToaster v-slot="toast" :toaster="toaster">
    <ToastRoot class="toast" :data-type="toast.type ?? 'info'">
      <div class="toast-body">
        <ToastTitle class="toast-title">{{ toast.title }}</ToastTitle>
        <ToastDescription v-if="toast.description" class="toast-desc">{{ toast.description }}</ToastDescription>
      </div>
      <ToastCloseTrigger class="toast-close" aria-label="Dismiss">✕</ToastCloseTrigger>
    </ToastRoot>
  </ArkToaster>
</template>

<style scoped>
/* ark-ui drives stacking/position via these custom props on each root; we own the visual box. */
.toast {
  translate: var(--x) var(--y);
  scale: var(--scale);
  z-index: var(--z-index);
  height: var(--height);
  opacity: var(--opacity);
  will-change: translate, opacity, scale;
  transition: translate 0.3s ease, scale 0.3s ease, opacity 0.3s ease;

  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 320px;
  padding: 10px 12px;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-3, 0 4px 16px rgba(0, 0, 0, 0.18));
  font-family: var(--font-sans);
  color: var(--gray-12);
}

/* A left accent bar keyed to the toast type. */
.toast[data-type='error'] { border-color: var(--red-6); }
.toast[data-type='error'] .toast-title { color: var(--red-11); }
.toast[data-type='success'] .toast-title { color: var(--green-11); }

.toast-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.toast-desc {
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--gray-10);
  cursor: pointer;
  font-size: var(--font-size-xs);
  line-height: 1;
  padding: 2px;
  border-radius: var(--radius-sm);
}

.toast-close:hover { color: var(--gray-12); background: var(--gray-4); }
.toast-close:focus-visible { outline: 2px solid var(--accent-9); outline-offset: -1px; }
</style>
