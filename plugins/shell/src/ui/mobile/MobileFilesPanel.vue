<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { useBackStack } from '@arxhub/uikit/hooks'
import { MOBILE_RAIL_HOST_ID } from './rail-host'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

// A layer, so the system back gesture closes it rather than leaving the app.
useBackStack(
  () => props.open,
  () => emit('close'),
)

// Everything in the rail is a navigation target, so choosing one dismisses the panel — including the
// one already active, which raises no event to react to. Expanding a folder is the exception: it has
// not navigated anywhere yet.
function onActivate(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, [role="treeitem"]:not([aria-expanded])')) emit('close')
}
</script>

<template>
  <!-- Always mounted, only hidden: the rail is teleported in here, and a target that comes and goes
       with the panel tears the teleport apart the first time it is opened. -->
  <div v-show="open" class="files-scrim" @click.self="emit('close')">
    <section class="files-panel" :aria-label="`${title} navigation`" @click="onActivate">
      <header class="files-bar">
        <span class="files-title">{{ title }}</span>
        <button type="button" class="files-close" aria-label="Close navigation" @click="emit('close')">
          <Icon name="lu:x" :size="16" />
        </button>
      </header>
      <div :id="MOBILE_RAIL_HOST_ID" class="files-body" />
    </section>
  </div>
</template>

<style scoped>
/* Covers the content it belongs to, never the bar underneath it — the keys stay live while the panel
   is up, so a wrong turn costs one tap rather than a dismissal first. */
.files-scrim {
  position: absolute;
  inset: 0;
  z-index: var(--z-index-overlay);
  display: flex;
  align-items: flex-end;
  background: var(--black-a3);
}

.files-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* The lower half: the note stays readable above it, which is what makes this a panel and not a page. */
  height: 56%;
  border-top: 1px solid var(--gray-6);
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: var(--gray-2);
  box-shadow: var(--shadow-xl);
}

.files-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: var(--size-md);
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--gray-4);
}

.files-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-12);
  font-size: 15px;
  font-weight: var(--font-weight-medium);
}

.files-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--size-md);
  height: var(--size-md);
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.files-close:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.files-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
