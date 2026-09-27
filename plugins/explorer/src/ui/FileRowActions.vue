<script setup lang="ts">
import { type ActionItem, ActionMenuButton } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { t } from '../i18n/messages'

defineProps<{ title: string; items: () => ActionItem[] }>()
const Trigger = useShellFrame() === 'mobile' ? ActionMenuButton : null
</script>

<template><component :is="Trigger" :label="t('tree.rowActions', { name: title })" :title="title" :items="items" /></template>
