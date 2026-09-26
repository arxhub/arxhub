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
  }>(),
  { menu: () => [] },
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
})
const more = computed(() => [...overflow.value, ...props.menu])
</script>

<template>
  <div ref="container" class="overflow-actions" :class="{ touch }">
    <!-- An empty sizing element survives even when every action moves into More. -->
    <span ref="item" class="measure" aria-hidden="true" />
    <div v-if="$slots.leading" ref="leading" class="pinned"><slot name="leading" /></div>
    <IconButton
      v-for="action in visible"
      :key="action.id"
      class="overflow-action"
      :class="{ danger: action.tone === 'danger' }"
      :size="touch ? 'xl' : 'lg'"
      :icon="action.icon"
      :tooltip="action.label"
      :disabled="action.disabled"
      @click="action.onSelect"
    />
    <span class="spacer" />
    <ActionMenuButton v-if="more.length" :label="moreLabel" :title="moreTitle ?? moreLabel" :items="() => more" />
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

.spacer {
  flex: 1;
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
