<script setup lang="ts">
import { IconButton, Strip } from '@arxhub/uikit/core'
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
// not navigated anywhere yet. [role="option"] covers Search's result listbox — a result is never
// expandable, so it carries none of the treeitem selector's aria-expanded exception.
function onActivate(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, [role="treeitem"]:not([aria-expanded]), [role="option"]')) emit('close')
}
</script>

<template>
  <!-- Always mounted, only hidden: the rail is teleported in here, and a target that comes and goes
       with the panel tears the teleport apart the first time it is opened. -->
  <div v-show="open" class="files-scrim" @click.self="emit('close')">
    <section class="files-panel" :aria-label="`${title} navigation`" @click="onActivate">
      <Strip :title="title">
        <template #actions>
          <IconButton icon="lu:x" size="xs" aria-label="Close navigation" @click="emit('close')" />
        </template>
      </Strip>
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
  background: var(--scrim);
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

.files-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
