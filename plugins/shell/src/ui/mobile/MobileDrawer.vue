<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { useArxHub, useBackStack } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'
import type { SidebarItem } from '../desktop/types'

const props = defineProps<{
  open: boolean
  items: SidebarItem[]
  activeId: string | null
}>()
const emit = defineEmits<{ 'item-select': [id: string]; close: [] }>()

// Mounted for the whole life of the app, not only while the mobile frame is up: a mini-app teleports
// its rail in here, and a target that comes and goes with the frame tears the teleport apart when
// the window is resized across the breakpoint.

// A drawer is a layer, so the system back gesture closes it rather than leaving the app.
useBackStack(
  () => props.open,
  () => emit('close'),
)

const arxhub = useArxHub()
const close = () => emit('close')
arxhub.events.on('panel:opened', close)
arxhub.events.on('panel:activated', close)
onUnmounted(() => {
  arxhub.events.off('panel:opened', close)
  arxhub.events.off('panel:activated', close)
})

// Everything in here is a navigation target, so choosing one dismisses the drawer — including the
// one already active, which raises no event to react to. Expanding a folder is the exception: it has
// not navigated anywhere yet.
function onActivate(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, [role="treeitem"]:not([aria-expanded])')) emit('close')
}
</script>

<template>
  <div v-show="open" class="drawer-backdrop" @click="emit('close')">
    <nav class="drawer" aria-label="Navigation" @click.stop="onActivate">
      <div id="arxhub-mobile-rail" class="drawer-rail" />
      <div class="drawer-apps">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="drawer-app"
          :class="{ active: item.id === activeId }"
          :aria-current="item.id === activeId ? 'page' : undefined"
          @click="emit('item-select', item.id)"
        >
          <Icon :name="item.icon" :size="18" />
          <span>{{ item.title }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  /* Overlay, not modal: a sheet or dialog opened from inside the drawer has to sit above it. */
  z-index: var(--z-index-overlay);
  background: var(--black-a6);
}

.drawer {
  display: flex;
  flex-direction: column;
  width: min(85vw, 20rem);
  height: 100%;
  background: var(--gray-1);
  border-right: 1px solid var(--gray-6);
  box-shadow: var(--shadow-lg);
}

.drawer-rail {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.drawer-apps {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.5rem;
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
  border-top: 1px solid var(--gray-6);
}

.drawer-app {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: var(--size-md);
  padding: 0 0.75rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.drawer-app.active {
  background: var(--gray-4);
  color: var(--gray-12);
}
</style>
