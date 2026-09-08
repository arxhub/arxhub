<script setup lang="ts">
import { IconButton, Strip } from '@arxhub/uikit/core'
import { useBackStack } from '@arxhub/uikit/hooks'
import type { Component } from 'vue'
import { MOBILE_RAIL_HOST_ID } from './rail-host'

const props = defineProps<{ open: boolean; title: string; nav: Component | null }>()
const emit = defineEmits<{ close: [] }>()

// A layer, so the system back gesture closes it rather than leaving the app.
useBackStack(
  () => props.open,
  () => emit('close'),
)

// Everything in here is a navigation target, so choosing one dismisses the panel — including the one
// already active, which raises no event to react to. Expanding a folder is the exception: it has not
// navigated anywhere yet. [role="option"] covers Search's result listbox — a result is never
// expandable, so it carries none of the treeitem selector's aria-expanded exception.
function onActivate(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, [role="treeitem"]:not([aria-expanded]), [role="option"]')) emit('close')
}
</script>

<template>
  <!-- Always mounted, only hidden: a mini-app that has not become a type yet teleports its rail into
       the host below, and a target that comes and goes with the panel tears the teleport apart the
       first time it is opened. -->
  <div v-show="open" class="nav-scrim" @click.self="emit('close')">
    <section class="nav-panel" :aria-label="`${title} navigation`" @click="onActivate">
      <!-- A head of the panel's own ONLY for a navigation that draws none. A type's `nav` names itself
           and carries the frame's close control inside its own strip (see nav-host.ts); a mini-app that
           has not become a type yet teleports in a bare rail, and then this is the only thing naming
           what is in the panel and the only way out of it that is not a gesture. -->
      <Strip v-if="props.nav == null" :title="title" flush-actions>
        <template #actions>
          <IconButton icon="lu:x" size="lg" ariaLabel="Close navigation" @click="emit('close')" />
        </template>
      </Strip>
      <div class="nav-body">
        <!-- Two sources, one panel. A type's own `nav` role is the model; the teleport host is what a
             mini-app still registered as a `SidebarItem` uses, and it stays until the last of them
             becomes a type. Both land in the same place because they are the same thing to the person
             holding the phone: the navigation of where they are. -->
        <component :is="props.nav" v-if="props.nav != null" class="nav-fill" />
        <div :id="MOBILE_RAIL_HOST_ID" class="nav-host" :class="{ 'nav-fill': props.nav == null }" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Covers the content it belongs to, never the row underneath it — the keys stay live while the panel
   is up, so a wrong turn costs one tap rather than a dismissal first. */
.nav-scrim {
  position: absolute;
  inset: 0;
  z-index: var(--z-index-overlay);
  display: flex;
  align-items: flex-end;
  background: var(--scrim);
}

.nav-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* The lower half: what is open stays readable above it, which is what makes this a panel and not a
     page. */
  height: 56%;
  border-top: 1px solid var(--gray-6);
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: var(--gray-2);
  box-shadow: var(--shadow-xl);
}

.nav-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.nav-fill {
  flex: 1;
  min-height: 0;
}

/* Always mounted so the teleport target never disappears, and it takes no room while the active type
   draws its own navigation above it. */
.nav-host:not(.nav-fill) {
  flex: 0 0 auto;
}
</style>
