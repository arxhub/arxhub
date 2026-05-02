import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { onUnmounted, type Ref, ref, watch } from 'vue'
import type { PanelTabDragData } from './drag-types'

interface UseDraggableTabOptions {
  el: Ref<HTMLElement | null>
  getData: () => Omit<PanelTabDragData, 'type'>
}

interface UseDraggableTabReturn {
  isDragging: Ref<boolean>
  closestEdge: Ref<Edge | null>
}

export function useDraggableTab({ el, getData }: UseDraggableTabOptions): UseDraggableTabReturn {
  const isDragging = ref(false)
  const closestEdge = ref<Edge | null>(null)

  let cleanup: (() => void) | null = null

  watch(
    el,
    (newEl) => {
      cleanup?.()
      cleanup = null
      if (!newEl) return
      cleanup = combine(
        draggable({
          element: newEl,
          getInitialData: () => ({ type: 'panel-tab' as const, ...getData() }),
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            nativeSetDragImage?.(newEl, 0, 0)
          },
          onDragStart: () => {
            isDragging.value = true
          },
          // pdnd guarantees onDrop fires in all cases (success, cancel, miss)
          onDrop: () => {
            isDragging.value = false
          },
        }),
        dropTargetForElements({
          element: newEl,
          canDrop: ({ source }) => source.data.type === 'panel-tab' && source.data.instanceId !== getData().instanceId,
          getData: ({ input, element: targetEl }) =>
            attachClosestEdge({ type: 'panel-tab' as const, ...getData() }, { element: targetEl, input, allowedEdges: ['left', 'right'] }),
          onDrag: ({ self }) => {
            closestEdge.value = extractClosestEdge(self.data)
          },
          onDragLeave: () => {
            closestEdge.value = null
          },
          onDrop: () => {
            closestEdge.value = null
          },
        }),
      )
    },
    { immediate: true, flush: 'post' },
  )

  onUnmounted(() => {
    cleanup?.()
  })

  return { isDragging, closestEdge }
}
