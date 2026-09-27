<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'

defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()
</script>

<template>
  <!-- Desktop rows are 28px — sm fills them; lg would overflow the row. -->
  <IconButton icon="lu:link" size="sm" :tooltip="t('action.copyLink')" :disabled="busy" @click="onCopy()" />
  <IconButton icon="lu:external-link" size="sm" :tooltip="t('action.openInBrowser')" :disabled="busy" @click="onOpen()" />
  <IconButton icon="lu:globe" size="sm" :tooltip="t('action.republish')" :disabled="busy" @click="onRepublish()" />
  <IconButton icon="lu:eye-off" size="sm" :tooltip="t('action.unpublish')" :disabled="busy" @click="onUnpublish()" />
</template>
