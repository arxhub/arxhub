<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOverflowActions } from '../hooks/useOverflowActions'
import { useShellFrame } from '../hooks/useShellFrame'
import ActionMenuButton from './ActionMenuButton.vue'
import type { ActionItem } from './action-menu'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    /** Inline while they fit, in priority order; the trailing ones move into More first. */
    actions: readonly ActionItem[]
    /** Only ever in More, after whatever overflowed: rare or destructive actions that never earn a key. */
    menu?: readonly ActionItem[]
    moreLabel: string
    moreTitle?: string
    /** `end` gathers the keys against More at the trailing edge — a band whose leading side is a name. */
    align?: 'start' | 'end'
    /** The leading slot is a label that takes whatever the keys leave, never less than this (a CSS length):
     *  the keys give way into More before the label goes below it. */
    leadingMin?: string
    /** A hairline between keys — a band whose keys fill its height edge to edge. */
    divided?: boolean
  }>(),
  { menu: () => [], align: 'start', leadingMin: undefined, divided: false },
)
const touch = useShellFrame() === 'mobile'
const container = ref<HTMLElement | null>(null)
const item = ref<HTMLElement | null>(null)
const leading = ref<HTMLElement | null>(null)
const trailing = ref<HTMLElement | null>(null)
const { visible, overflow } = useOverflowActions(() => props.actions, {
  container,
  item,
  leading,
  trailing,
  reserveOverflow: () => props.menu.length > 0,
  leadingGrows: () => props.leadingMin != null,
})
const more = computed(() => [...overflow.value, ...props.menu])
</script>

<template>
  <div ref="container" class="overflow-actions" :class="{ touch, divided }">
    <!-- An empty sizing element survives even when every action moves into More. -->
    <span ref="item" class="measure" aria-hidden="true" />
    <div v-if="$slots.leading" ref="leading" class="pinned" :class="{ grow: leadingMin != null }" :style="leadingMin != null ? { minWidth: leadingMin } : undefined">
      <slot name="leading" />
    </div>
    <span v-if="align === 'end' && leadingMin == null" class="spacer" />
    <IconButton
      v-for="action in visible"
      :key="action.id"
      class="overflow-action"
      :class="{ danger: action.tone === 'danger' }"
      :size="touch ? 'row' : 'lg'"
      :icon="action.icon"
      :tooltip="action.label"
      :disabled="action.disabled"
      @click="action.onSelect"
    />
    <span v-if="align === 'start'" class="spacer" />
    <ActionMenuButton v-if="more.length" class="overflow-more" :label="moreLabel" :title="moreTitle ?? moreLabel" :items="() => more" />
    <div v-if="$slots.trailing" ref="trailing" class="pinned"><slot name="trailing" /></div>
  </div>
</template>

<style scoped>
.overflow-actions {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.pinned {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.pinned.grow {
  flex: 1 1 0;
  align-self: stretch;
}

.spacer {
  flex: 1;
}

/* :deep because a key with a tooltip is rooted in the tooltip, not in the button that carries the class. */
.divided > :deep(.overflow-action),
.divided > :deep(.overflow-more) {
  border-left: 1px solid var(--gray-4);
  border-radius: 0;
}

.measure {
  position: absolute;
  visibility: hidden;
  width: var(--size-md);
}

.touch > .measure {
  width: var(--size-xl);
}

.overflow-action.danger:not(:disabled) {
  color: var(--danger-11);
}
</style>
