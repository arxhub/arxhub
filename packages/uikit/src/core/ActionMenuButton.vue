<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import { type ActionItem, actionMenu } from './action-menu'
import IconButton from './IconButton.vue'

const props = defineProps<{ label: string; title: string; items: () => ActionItem[]; disabled?: boolean }>()
const size = useShellFrame() === 'mobile' ? 'xl' : 'lg'
function open(event: MouseEvent): void {
  const box = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  const x = event.detail === 0 && box ? box.left : event.clientX
  const y = event.detail === 0 && box ? box.bottom : event.clientY
  actionMenu.open(props.items(), { x, y, title: props.title })
}
</script>

<template>
  <IconButton :size="size" icon="lu:ellipsis" :tooltip="label" :aria-label="label" :disabled="disabled"
    aria-haspopup="menu" @click.stop="open" @keydown.stop />
</template>
