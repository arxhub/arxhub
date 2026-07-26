import { type ComputedRef, computed, onScopeDispose, ref, useId } from 'vue'

// The mobile frame has no permanent column for a mini-app's own navigation, so the mini-app teleports
// its rail into a panel instead. The frame has to know two things before it offers the key that opens
// it: whether anything is in there at all — an empty panel behind a live key is worse than no key —
// and what to call it. The name comes from the mini-app, because only it knows: the same panel holds
// files under Explorer and sections under Settings.
export const MOBILE_RAIL_HOST_ID = 'arxhub-mobile-rail'

export interface RailClaim {
  // Unset when the mini-app did not name its rail; the frame falls back to the mini-app's own title,
  // which is never actively wrong.
  title?: string
  icon: string
}

// A stack rather than one slot: mini-apps overlap during a switch — the incoming one mounts before the
// outgoing one is torn down — so the newest claim is the one on screen, and releasing a claim must not
// depend on the order they leave in.
const claims = ref<{ id: string; claim: RailClaim }[]>([])

// Indexed rather than `.at(-1)`: the app instance's own tsconfig targets a lib without it, and this
// file is typechecked through that instance.
export const railClaim: ComputedRef<RailClaim | null> = computed(() => claims.value[claims.value.length - 1]?.claim ?? null)

export function claimRailHost(claim: RailClaim): void {
  const id = useId() ?? `rail-${claims.value.length}`
  claims.value = [...claims.value, { id, claim }]
  onScopeDispose(() => {
    claims.value = claims.value.filter((entry) => entry.id !== id)
  })
}
