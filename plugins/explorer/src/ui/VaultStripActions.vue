<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopVaultStripActions from './DesktopVaultStripActions.vue'
import MobileVaultStripActions from './MobileVaultStripActions.vue'

const impl = useShellFrame() === 'mobile' ? MobileVaultStripActions : DesktopVaultStripActions
</script>

<template>
  <component :is="impl" />
</template>
