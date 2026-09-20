<script setup lang="ts">
import { pointerIntersection } from '@dnd-kit/collision'
import { useDraggable, useDroppable } from '@dnd-kit/vue'
import { type ComponentPublicInstance, shallowRef } from 'vue'

const props = defineProps<{ id: string; nodeId: string | null; draggable: boolean; droppable: boolean }>()
const element = shallowRef<HTMLElement | ComponentPublicInstance | null>(null)
const setElement = (value: Element | ComponentPublicInstance | null) => {
  element.value = value as HTMLElement | ComponentPublicInstance | null
}
useDraggable({ id: () => props.id, element, disabled: () => !props.draggable, data: () => ({ nodeId: props.nodeId }) })
useDroppable({
  id: () => props.id,
  element,
  disabled: () => !props.droppable,
  data: () => ({ nodeId: props.nodeId }),
  collisionDetector: () => pointerIntersection,
})
</script>

<template><slot :set-element="setElement" /></template>
