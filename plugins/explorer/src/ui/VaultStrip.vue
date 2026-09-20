<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopVaultStrip from './DesktopVaultStrip.vue'
import MobileVaultStrip from './MobileVaultStrip.vue'

const impl = useShellFrame() === 'mobile' ? MobileVaultStrip : DesktopVaultStrip
</script>

<template>
  <component :is="impl" />
</template>
