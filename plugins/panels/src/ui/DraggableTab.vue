<script setup lang="ts">
import { type ActionItem, actionMenu, Icon, IconButton } from '@arxhub/uikit/core'
import type { PanelChromeState } from '@arxhub/uikit/hooks'
import { ref } from 'vue'
import { useDraggableTab } from '../composables/use-draggable-tab'
import { usePanels } from '../use-panels'
import TabDropIndicator from './TabDropIndicator.vue'

const props = defineProps<{
  instanceId: string
  groupId: string
  index: number
  title: string
  isActive: boolean
  chrome?: PanelChromeState
}>()

const emit = defineEmits<{
  click: []
  close: []
}>()

const tabEl = ref<HTMLElement | null>(null)

const { isDragging, closestEdge } = useDraggableTab({
  el: tabEl,
  getData: () => ({ instanceId: props.instanceId, groupId: props.groupId, index: props.index }),
})

// Keyboard/right-click equivalent of the drag-and-drop reorder and cross-split move — same
// `movePanel` mutation the drop handler calls, reached through the project's one contextual-action-list
// pattern (`actionMenu`) instead of a bespoke shortcut. A native `contextmenu` event also fires for the
// keyboard "Menu"/Shift+F10 key on the focused element, so this needs no separate keydown handler.
const store = usePanels()

function onContextMenu(event: MouseEvent) {
  const group = store.groups.value[props.groupId]
  const index = group?.instances.findIndex((i) => i.instanceId === props.instanceId) ?? -1
  if (!group || index === -1) return

  const orderedGroupIds = store.getOrderedGroupIds()
  const groupIndex = orderedGroupIds.indexOf(props.groupId)
  const previousGroupId = groupIndex > 0 ? orderedGroupIds[groupIndex - 1] : undefined
  const nextGroupId = groupIndex >= 0 && groupIndex < orderedGroupIds.length - 1 ? orderedGroupIds[groupIndex + 1] : undefined

  const items: ActionItem[] = [
    {
      id: 'move-left',
      label: 'Move left',
      icon: 'lu:arrow-left',
      disabled: index === 0,
      // toIndex === index - 1 swaps this tab with its left neighbour (movePanel treats toIndex as an
      // insertion point, not a final position — see panel-store.ts movePanel for the arithmetic).
      onSelect: () => store.movePanel(props.instanceId, props.groupId, props.groupId, index - 1),
    },
    {
      id: 'move-right',
      label: 'Move right',
      icon: 'lu:arrow-right',
      disabled: index === group.instances.length - 1,
      // toIndex === index + 2 swaps this tab with its right neighbour, for the same reason.
      onSelect: () => store.movePanel(props.instanceId, props.groupId, props.groupId, index + 2),
    },
  ]

  if (orderedGroupIds.length > 1) {
    items.push(
      {
        id: 'move-to-previous-split',
        label: 'Move to previous split',
        icon: 'lu:arrow-left-to-line',
        disabled: !previousGroupId,
        onSelect: () => {
          if (!previousGroupId) return
          const target = store.groups.value[previousGroupId]
          store.movePanel(props.instanceId, props.groupId, previousGroupId, target?.instances.length ?? 0)
        },
      },
      {
        id: 'move-to-next-split',
        label: 'Move to next split',
        icon: 'lu:arrow-right-to-line',
        disabled: !nextGroupId,
        onSelect: () => {
          if (!nextGroupId) return
          const target = store.groups.value[nextGroupId]
          store.movePanel(props.instanceId, props.groupId, nextGroupId, target?.instances.length ?? 0)
        },
      },
    )
  }

  actionMenu.open(items, { x: event.clientX, y: event.clientY, title: props.title })
}
</script>

<template>
  <div
    ref="tabEl"
    role="button"
    tabindex="0"
    class="tab"
    :class="{ active: isActive, 'is-dragging': isDragging }"
    @click="emit('click')"
    @contextmenu.prevent.stop="onContextMenu"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <Icon v-if="chrome?.icon" :name="chrome.icon" :size="14" aria-hidden="true" />
    <span class="tab-title">{{ title }}</span>
    <span v-if="chrome?.status" class="tab-status" :class="chrome.status.tone" role="status" :aria-label="chrome.status.label" :title="chrome.status.label"><Icon :name="chrome.status.icon" :size="14" /></span>
    <IconButton class="tab-close" icon="lu:x" size="xs" tooltip="Close" @click.stop="emit('close')" />
    <TabDropIndicator :edge="closestEdge" />
  </div>
</template>

<style scoped>
/* Tabs are pills inside the strip rather than full-height cells divided by rules: the active one is
   stated by its own fill, so the strip needs no vertical dividers and no accent underline. */
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  height: var(--size-md);
  max-width: 220px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.tab:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

/* A tab IS a selection, so it takes the app's one selection treatment — an accent wash plus accent
   text, no border. It used to state itself with a grey fill, which made the active document the only
   selected thing in the app that did not look selected: the tree row that opened it, the settings
   section beside it and the search result above it all read as accent. */
.tab.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

.tab-status { display: flex; flex-shrink: 0; }
.tab-status.danger { color: var(--danger-11); }
.tab-status.warning { color: var(--warning-11); }

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab.is-dragging {
  background-color: transparent;
  color: transparent;
  border-color: var(--accent-7);
  border-style: dashed;
  opacity: 1;
}

.tab.is-dragging .tab-close {
  visibility: hidden;
}
</style>
