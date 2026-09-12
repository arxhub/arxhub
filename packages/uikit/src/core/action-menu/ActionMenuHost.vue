<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShellFrame } from '../../hooks/useShellFrame'
import BottomSheet from '../BottomSheet.vue'
import Icon from '../Icon.vue'
import Row from '../Row.vue'
import { actionMenu, useActionMenuState } from './action-menu'

const state = useActionMenuState()
// Two presentations of one action list: a popover under the pointer, or a sheet in thumb reach.
const isMobile = useShellFrame() === 'mobile'
const menuEl = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null
let selectedAction: (() => void) | null = null

// Where the menu actually lands, which is the pointer only while the whole menu fits there. A menu is
// opened by a right-click, and a right-click near the bottom of a long list is the ordinary case, not
// the edge case — anchored at the pointer alone it ran off the screen and its items became unclickable
// while still being visible and enabled, which is the worst shape a control can take.
// `placed` is its own flag rather than a coordinate test: a right-click in the top-left corner opens a
// menu legitimately at 0,0, and treating that as "not measured yet" would hide it.
const placement = ref({ x: 0, y: 0, placed: false })

// Measured after the menu is in the DOM: its height depends on how many actions the caller passed, so
// there is nothing to clamp against until it has been laid out.
function place(): void {
  const menu = menuEl.value
  if (menu == null) return
  const { width, height } = menu.getBoundingClientRect()
  // Flip to the other side of the pointer when there is room there, and only clamp to the edge when
  // there is not — flipping keeps the pointer outside the menu, so the click that opened it cannot land
  // on an item.
  const x = state.value.x + width > window.innerWidth ? Math.max(0, state.value.x - width) : state.value.x
  const y = state.value.y + height > window.innerHeight ? Math.max(0, state.value.y - height) : state.value.y
  placement.value = { x, y, placed: true }
}

function run(item: { disabled?: boolean; onSelect: () => void }) {
  if (item.disabled) return
  selectedAction = item.onSelect
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
    anchored = false
    if (!open) {
      const action = selectedAction
      selectedAction = null
      // Ark restores focus on a timer. This menu owns the handoff instead: release the trap,
      // restore the opener, then let an action focus its input or open the next dialog.
      nextTick(() => {
        if (opener?.isConnected && opener.getClientRects().length) opener.focus()
        action?.()
      })
      return
    }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (isMobile) return
    placement.value = { x: state.value.x, y: state.value.y, placed: false }
    nextTick(() => {
      place()
      focusItem(0)
      // One frame, not a delay: a scroll the opening click caused is delivered in the frame the menu
      // opened in, and every scroll after that one is the user moving away from it.
      requestAnimationFrame(() => {
        anchored = true
      })
    })
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

// Stays a listener of its own, and is not a hotkey. Escape on your own open menu is the CONTROL's
// key — the boundary the registry draws is that it owns the chords of the application while the keys
// inside a focused control belong to the control and to Ark UI under it. `packages/uikit` also may not
// depend on a plugin, which is the other half of the same rule: reversing that would make the design
// system depend on the app it is a system for.
function onGlobalKeydown(event: KeyboardEvent) {
  if (state.value.open && event.key === 'Escape') actionMenu.close()
}

// Scroll/resize/blur invalidate a pointer-anchored menu — but only once it is actually up. The click
// that opens the menu can itself cause a scroll: right-clicking a row that is only half in view makes
// its list scroll to show it, and that scroll event is delivered AFTER the contextmenu handler has
// already opened the menu. Unarmed for one frame, the menu no longer closes itself the moment it
// appears, which is what it did on every right-click near the ends of a long file tree — a menu that
// flashes and vanishes reads as a control that does nothing.
let anchored = false

function onCloseIfAnchored() {
  if (!isMobile && anchored) actionMenu.close()
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
      :style="{ top: `${placement.y}px`, left: `${placement.x}px`, visibility: placement.placed ? undefined : 'hidden' }"
      @contextmenu.prevent
      @keydown="onMenuKeydown"
    >
      <Row
        v-for="item in state.items"
        :key="item.id"
        as="button"
        type="button"
        class="action-item"
        :tone="item.variant === 'danger' ? 'danger' : 'neutral'"
        role="menuitem"
        tabindex="-1"
        :disabled="item.disabled"
        @click="run(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="14" />
        <span class="action-label">{{ item.label }}</span>
      </Row>
    </div>
  </Teleport>

  <!-- Narrow screens get the same items as a bottom sheet: one list of actions, declared once. -->
  <BottomSheet :open="state.open && isMobile" :title="state.title" :restore-focus="false" label="Actions" @close="actionMenu.close()">
    <div class="action-sheet" role="menu">
      <Row
        v-for="item in state.items"
        :key="item.id"
        as="button"
        type="button"
        class="action-sheet-item"
        :tone="item.variant === 'danger' ? 'danger' : 'neutral'"
        role="menuitem"
        :disabled="item.disabled"
        @click="run(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </Row>
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

.action-label {
  flex: 1;
}

/* The sheet itself — backdrop, dismissal, back handling — belongs to BottomSheet; only the item
   list is styled here. */
.action-sheet {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
}
</style>
