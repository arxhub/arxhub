<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import type { ChangeKind } from '../model'

const props = defineProps<{ change: ChangeKind | 'container' }>()

// DS-7: status glyphs of their own, so "added" never reads as "create" or "removed" as "zoom out".
const GLYPHS: Record<ChangeKind | 'container', string> = {
  added: 'lu:square-plus',
  removed: 'lu:square-minus',
  changed: 'lu:square-pen',
  moved: 'lu:move',
  container: 'lu:square-pen',
}

const size = useShellFrame() === 'mobile' ? 16 : 14
const name = computed(() => GLYPHS[props.change])
</script>

<template>
  <Icon :name="name" :size="size" />
</template>
