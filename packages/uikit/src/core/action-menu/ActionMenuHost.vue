<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShellFrame } from '../../hooks/useShellFrame'
import BottomSheet from '../BottomSheet.vue'
import Icon from '../Icon.vue'
import { actionMenu, useActionMenuState } from './action-menu'

const state = useActionMenuState()
// Two presentations of one action list: a popover under the pointer, or a sheet in thumb reach.
const isMobile = useShellFrame() === 'mobile'
const menuEl = ref<HTMLElement | null>(null)

function run(item: { disabled?: boolean; onSelect: () => void }) {
  if (item.disabled) return
  item.onSelect()
  actionMenu.close()
}

// Roving focus over the enabled items (desktop menu — see onMenuKeydown).
function focusItem(index: number) {
  const items = menuEl.value?.querySelectorAll<HTMLButtonElement>('.action-item:not(:disabled)')
  if (!items?.length) return
  items[(index + items.length) % items.length]?.focus()
}

function onMenuKeydown(event: KeyboardEvent) {
  const items = Array.from(menuEl.value?.querySelectorAll<HTMLButtonElement>('.action-item:not(:disabled)') ?? [])
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusItem(current + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusItem(current - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    focusItem(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusItem(items.length - 1)
  }
}

// Focus the first item when the desktop menu opens so it's keyboard-drivable.
watch(
  () => state.value.open,
  (open) => {
    if (open && !isMobile) nextTick(() => focusItem(0))
  },
)

function onGlobalPointerDown(event: PointerEvent) {
  if (!state.value.open) return
  // The sheet dismisses itself (backdrop, drag, back), and it lives outside menuEl — leaving it to
  // this handler would close it on the very tap meant to pick an item.
  if (isMobile) return
  if (menuEl.value?.contains(event.target as Node)) return
  actionMenu.close()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (state.value.open && event.key === 'Escape') actionMenu.close()
}

// Scroll/resize/blur reposition or invalidate a pointer-anchored menu; a sheet is anchored to the
// screen edge and survives all three.
function onCloseIfAnchored() {
  if (!isMobile) actionMenu.close()
}

onMounted(() => {
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('scroll', onCloseIfAnchored, true)
  window.addEventListener('resize', onCloseIfAnchored)
  window.addEventListener('blur', onCloseIfAnchored)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('scroll', onCloseIfAnchored, true)
  window.removeEventListener('resize', onCloseIfAnchored)
  window.removeEventListener('blur', onCloseIfAnchored)
})
</script>

<template>
  <Teleport to="body">
    <!-- Desktop: context menu anchored at the pointer -->
    <div
      v-if="state.open && !isMobile"
      ref="menuEl"
      class="action-menu"
      role="menu"
      :style="{ top: `${state.y}px`, left: `${state.x}px` }"
      @contextmenu.prevent
      @keydown="onMenuKeydown"
    >
      <button
        v-for="item in state.items"
        :key="item.id"
        class="action-item"
        :class="{ danger: item.variant === 'danger' }"
        role="menuitem"
        tabindex="-1"
        :disabled="item.disabled"
        @click="run(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="14" />
        <span class="action-label">{{ item.label }}</span>
      </button>
    </div>

  </Teleport>

  <!-- Narrow screens get the same items as a bottom sheet: one list of actions, declared once. -->
  <BottomSheet :open="state.open && isMobile" :title="state.title" label="Actions" @close="actionMenu.close()">
    <div class="action-sheet" role="menu">
      <button
        v-for="item in state.items"
        :key="item.id"
        class="action-sheet-item"
        :class="{ danger: item.variant === 'danger' }"
        role="menuitem"
        :disabled="item.disabled"
        @click="run(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.action-menu {
  position: fixed;
  z-index: var(--z-index-dropdown);
  display: flex;
  flex-direction: column;
  min-width: 168px;
  padding: 4px;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 12px;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--gray-12);
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  cursor: pointer;
}

.action-item:hover:not(:disabled) {
  background: var(--gray-4);
}

.action-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -2px;
}

.action-item:disabled {
  color: var(--gray-9);
  cursor: default;
}

.action-item.danger {
  color: var(--danger-11);
}

.action-item.danger:hover:not(:disabled) {
  background: var(--danger-3);
}

.action-label {
  flex: 1;
}

/* The sheet itself — backdrop, dismissal, back handling — belongs to BottomSheet; only the item
   list is styled here. */
.action-sheet {
  display: flex;
  flex-direction: column;
  padding: 0 0.5rem;
}

.action-sheet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 0 12px;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--gray-12);
  font-size: var(--font-size-md);
  font-family: var(--font-sans);
  cursor: pointer;
}

.action-sheet-item:disabled {
  color: var(--gray-9);
}

.action-sheet-item.danger {
  color: var(--danger-11);
}
</style>
