<script setup lang="ts">
import { useMediaQuery } from '@arxhub/uikit/hooks'
import { DesktopLayout } from '@arxhub/uikit/desktop'
import { MobileLayout } from '@arxhub/uikit/mobile'

const isMobile = useMediaQuery('(max-width: 768px)')
</script>

<template>
  <MobileLayout v-if="isMobile" />
  <DesktopLayout v-else />
</template>
