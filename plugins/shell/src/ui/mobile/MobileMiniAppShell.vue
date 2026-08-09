<script setup lang="ts">
import { onActivated, onDeactivated, onUnmounted, ref, useId, useSlots } from 'vue'
import { claimRailHost, fallbackRailId, MOBILE_RAIL_HOST_ID, releaseRailHost } from './rail-host'

const props = withDefaults(
  defineProps<{
    // Accepted for one shape across both frames; a phone has no second column to size.
    widthKey?: string
    // Force-hide the rail even when a #rail slot is provided.
    rail?: boolean
    // What this mini-app's rail holds, for the key that reveals it — the frame falls back to the
    // mini-app's own title, which is at least never wrong, unlike a frame-level guess like "Files".
    railTitle?: string
    railIcon?: string
  }>(),
  { widthKey: 'default', rail: true, railIcon: 'lu:panel-bottom' },
)

const slots = useSlots()
// A mini-app declares its #rail slot in its own template, so whether it has one is fixed for the life
// of the component — settled once here rather than watched.
const hasRail = props.rail && !!slots.rail
const id = useId() ?? fallbackRailId()

// A mini-app's layout sits inside MobileShell's <KeepAlive>, so switching away deactivates this
// component rather than unmounting it — a claim made once at setup and never released left every
// previously-visited mini-app's Teleport still rendering into the shared rail host forever, stacked
// underneath whichever one claimed the (title, icon) pair last: Explorer's file tree and Search's rail
// both live in #arxhub-mobile-rail at once, and the dock key names only the most recent of them.
// onActivated fires once on the initial mount too, so claiming only there — never at setup — covers
// both the first appearance and every later return; onUnmounted stays as a defensive fallback for
// mounting outside any KeepAlive ancestor, where onActivated/onDeactivated never fire at all.
const isActive = ref(false)

function claim(): void {
  isActive.value = true
  if (hasRail) claimRailHost(id, { title: props.railTitle, icon: props.railIcon })
}

function release(): void {
  isActive.value = false
  releaseRailHost(id)
}

onActivated(claim)
onDeactivated(release)
onUnmounted(release)
</script>

<template>
  <!-- Deferred because the host is mounted by the frame after this content: the panel sits below the
       stage in the tree, so its target does not exist yet on our first render. isActive, not just
       hasRail, gates the Teleport itself — otherwise the claim stops naming this mini-app on
       deactivation while its content keeps teleporting into the shared host regardless. -->
  <Teleport v-if="hasRail && isActive" :to="`#${MOBILE_RAIL_HOST_ID}`" defer>
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
