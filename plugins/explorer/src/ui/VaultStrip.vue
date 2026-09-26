<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopVaultStrip from './DesktopVaultStrip.vue'

// The phone has no strip here: the vault is a sheet whose own header already names it and closes it, and
// making something new is the band's New, which asks where.
const impl = useShellFrame() === 'mobile' ? null : DesktopVaultStrip
</script>

<template>
  <component :is="impl" v-if="impl != null" />
</template>
