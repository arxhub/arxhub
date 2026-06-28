<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Icon from '../Icon.vue'
import { actionMenu, useActionMenuState } from './action-menu'

const state = useActionMenuState()
const isMobile = useMediaQuery('(max-width: 640px)')
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
    if (open && !isMobile.value) nextTick(() => focusItem(0))
  },
)

function onGlobalPointerDown(event: PointerEvent) {
  if (!state.value.open) return
  if (menuEl.value?.contains(event.target as Node)) return
  actionMenu.close()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (state.value.open && event.key === 'Escape') actionMenu.close()
}

function onClose() {
  actionMenu.close()
}

onMounted(() => {
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('scroll', onClose, true)
  window.addEventListener('resize', onClose)
  window.addEventListener('blur', onClose)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('scroll', onClose, true)
  window.removeEventListener('resize', onClose)
  window.removeEventListener('blur', onClose)
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

    <!-- Mobile: TODO render a <BottomSheet> of the same items (deferred; contract is final). -->
    <div
      v-else-if="state.open && isMobile"
      ref="menuEl"
      class="action-sheet"
    >
      <div v-if="state.title" class="action-sheet-title">{{ state.title }}</div>
      <button
        v-for="item in state.items"
        :key="item.id"
        class="action-sheet-item"
        :class="{ danger: item.variant === 'danger' }"
        :disabled="item.disabled"
        @click="run(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.action-menu {
  position: fixed;
  z-index: var(--z-index-dropdown);
  display: flex;
  flex-direction: column;
  min-width: 160px;
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
  padding: 4px 12px;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--gray-12);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  cursor: pointer;
}

.action-item:hover:not(:disabled) {
  background: var(--gray-4);
}

.action-item:disabled {
  opacity: 0.5;
  cursor: default;
}

.action-item.danger {
  color: var(--danger-9);
}

.action-item.danger:hover:not(:disabled) {
  background: var(--danger-a3);
}

.action-label {
  flex: 1;
}

/* Mobile bottom-sheet (placeholder styling; full BottomSheet primitive is future work) */
.action-sheet {
  position: fixed;
  z-index: var(--z-index-modal);
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: var(--gray-2);
  border-top: 1px solid var(--gray-6);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
}

.action-sheet-title {
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-10);
}

.action-sheet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  text-align: left;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--gray-12);
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  cursor: pointer;
}

.action-sheet-item.danger {
  color: var(--danger-9);
}
</style>
