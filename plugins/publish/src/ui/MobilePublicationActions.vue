<script setup lang="ts">
import { type ActionItem, ActionMenuButton, IconButton } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'

const props = defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()

function items(): ActionItem[] {
  return [
    { id: 'open', label: t('action.openInBrowser'), icon: 'lu:external-link', disabled: props.busy, onSelect: props.onOpen },
    { id: 'republish', label: t('action.republish'), icon: 'lu:globe', disabled: props.busy, onSelect: props.onRepublish },
    { id: 'unpublish', label: t('action.unpublish'), icon: 'lu:eye-off', disabled: props.busy, onSelect: props.onUnpublish },
  ]
}
</script>

<template>
  <!-- Frequent: Copy link. Occasional: behind More — four lg icons do not fit a 360 row. -->
  <IconButton size="xl" icon="lu:link" :tooltip="t('action.copyLink')" :disabled="busy" @click="onCopy()" />
  <ActionMenuButton :label="t('action.more')" :title="t('action.menuTitle')" :items="items" :disabled="busy" />
</template>
