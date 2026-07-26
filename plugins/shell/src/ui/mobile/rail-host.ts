import { type ComputedRef, computed, onScopeDispose, ref } from 'vue'

// The mobile frame has no permanent column for a mini-app's own navigation, so the mini-app teleports
// its rail into the files panel instead. The frame has to know whether anything is in there before it
// offers the key that opens it: an empty panel behind a live tab is worse than no tab at all.
export const MOBILE_RAIL_HOST_ID = 'arxhub-mobile-rail'

const claims = ref(0)

export const railPresent: ComputedRef<boolean> = computed(() => claims.value > 0)

// Counted rather than a boolean: mini-apps overlap during a switch — the incoming one mounts before
// the outgoing one is torn down — and a flag would be cleared by whichever left last.
export function claimRailHost(): void {
  claims.value++
  onScopeDispose(() => {
    claims.value--
  })
}
