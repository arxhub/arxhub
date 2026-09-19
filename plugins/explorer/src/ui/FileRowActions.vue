<script setup lang="ts">
import { type ActionItem, ActionMenuButton } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'

defineProps<{ title: string; items: () => ActionItem[] }>()
const Trigger = useShellFrame() === 'mobile' ? ActionMenuButton : null
</script>

<template><component :is="Trigger" :label="`Actions for ${title}`" :title="title" :items="items" /></template>
