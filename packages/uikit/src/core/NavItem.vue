<script setup lang="ts">
import { computed } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'
import Tooltip from './Tooltip.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  title: string
  icon: string
  // "Where I am" — the accent. Exactly one key of a rail or row wears it (F-17).
  active?: boolean
  // A layer this key raised is up — the raised fill, never the accent: a layer is ON TOP of where you
  // are, not a second place to be (F-17).
  open?: boolean
  // What the key holds (open tabs, hidden types). Zero is never drawn: an empty badge would say "a
  // number belongs here", which is not a number.
  count?: number
}>()

// The frame decides the geometry, as for Row: a 40px square in the desktop rail, a key that shares the
// phone's bottom row at touch height. Read once — the frame never changes while the app is up. A touch
// key has no tooltip: there is no hover to show it on, and a long press belongs to the system.
const touch = useShellFrame() === 'mobile'
const badge = computed(() => (props.count == null || props.count <= 0 ? null : props.count > 99 ? '99+' : String(props.count)))
</script>

<template>
  <component :is="touch ? 'div' : Tooltip" :class="{ 'nav-item-slot': touch }" v-bind="touch ? {} : { label: title, placement: 'right' }">
    <button
      class="nav-item"
      :class="{ active, open, touch }"
      :aria-label="title"
      :aria-pressed="active || undefined"
      v-bind="$attrs"
    >
      <span class="glyph">
        <Icon :name="icon" :size="20" />
        <!-- Not the accent: in a row of types the accent means "where I am", and it is already spent. -->
        <span v-if="badge" class="count" aria-hidden="true">{{ badge }}</span>
      </span>
    </button>
  </component>
</template>

<style scoped>
.nav-item {
  position: relative;
  width: var(--size-md);
  height: var(--size-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  background-color: transparent;
  color: var(--gray-11);
  border: none;
  cursor: pointer;
  transition: background-color var(--duration-fast), color var(--duration-fast);
}

.nav-item-slot {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
}

.nav-item.touch {
  width: 100%;
  height: var(--size-xl);
  border-radius: 0;
}

.nav-item:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.nav-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.nav-item.open {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

/* Selection is the one place the accent is spent on chrome — a wash plus accent text, no border. */
.nav-item.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
}

.glyph {
  display: flex;
}

/* On the 40px desktop key the badge sits in the key's own corner, so it can never leave the key — the
   rail clips horizontally and a glyph-relative badge ran past its edge at two digits. */
.count {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 16px;
  max-width: 28px;
  overflow: hidden;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--gray-11);
  color: var(--gray-1);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}

/* A touch key is as wide as a quarter of the row, so its corner is far from the glyph it counts; the
   badge hangs off the glyph's shoulder instead. */
.touch .glyph {
  position: relative;
}

.touch .count {
  top: -8px;
  right: auto;
  left: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .nav-item {
    transition: none;
  }
}
</style>
