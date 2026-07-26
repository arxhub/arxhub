<script setup lang="ts">
import { useSlots } from 'vue'
import { claimRailHost, MOBILE_RAIL_HOST_ID } from './rail-host'

const props = withDefaults(
  defineProps<{
    // Accepted for one shape across both frames; a phone has no second column to size.
    widthKey?: string
    // Force-hide the rail even when a #rail slot is provided.
    rail?: boolean
  }>(),
  { widthKey: 'default', rail: true },
)

const slots = useSlots()
// A mini-app declares its #rail slot in its own template, so whether it has one is fixed for the life
// of the component — settled once here rather than watched.
const hasRail = props.rail && !!slots.rail
// Tells the frame there is something behind the Files key. Without a claim the key does not render.
if (hasRail) claimRailHost()
</script>

<template>
  <!-- Deferred because the host is mounted by the frame after this content: the panel sits below the
       stage in the tree, so its target does not exist yet on our first render. -->
  <Teleport v-if="hasRail" :to="`#${MOBILE_RAIL_HOST_ID}`" defer>
    <slot name="rail" />
  </Teleport>

  <!-- The content is the whole screen. A mini-app's navigation is a layer you summon, not a column
       that permanently spends a third of the width. -->
  <div class="mini-app-shell">
    <slot />
  </div>
</template>

<style scoped>
.mini-app-shell {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
