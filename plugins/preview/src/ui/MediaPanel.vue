<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopMediaPanel from './DesktopMediaPanel.vue'
import MobileMediaPanel from './MobileMediaPanel.vue'
import { useMedia } from './use-media'

const props = defineProps<{ path: string }>()
const state = useMedia(() => props.path)
const impl = useShellFrame() === 'mobile' ? MobileMediaPanel : DesktopMediaPanel
</script>

<template>
  <component :is="impl" :path="path" :state="state" />
</template>
