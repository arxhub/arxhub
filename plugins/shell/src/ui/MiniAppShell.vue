<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopMiniAppShell from './desktop/DesktopMiniAppShell.vue'
import MobileMiniAppShell from './mobile/MobileMiniAppShell.vue'

withDefaults(
  defineProps<{
    // Shared-width key — same key links rails across mini-apps. Default links all of them.
    widthKey?: string
    // Force-hide the rail even when a #rail slot is provided.
    rail?: boolean
  }>(),
  { widthKey: 'default', rail: true },
)

// The one dispatch between the two frames, so a mini-app writes <MiniAppShell> once and never asks
// which frame it is in. A rail beside the content and a rail summoned into a panel are different
// components, not one component with the difference spread through its template.
const impl = useShellFrame() === 'mobile' ? MobileMiniAppShell : DesktopMiniAppShell
</script>

<template>
  <component :is="impl" :width-key="widthKey" :rail="rail">
    <template v-if="$slots.rail" #rail>
      <slot name="rail" />
    </template>
    <slot />
  </component>
</template>
