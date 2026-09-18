<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopPublicationActions from './DesktopPublicationActions.vue'
import MobilePublicationActions from './MobilePublicationActions.vue'

defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()

const impl = useShellFrame() === 'mobile' ? MobilePublicationActions : DesktopPublicationActions
</script>

<template>
  <component
    :is="impl"
    :busy="busy"
    :on-copy="onCopy"
    :on-open="onOpen"
    :on-republish="onRepublish"
    :on-unpublish="onUnpublish"
  />
</template>
