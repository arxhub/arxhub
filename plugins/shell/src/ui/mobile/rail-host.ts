import { type ComputedRef, computed, ref } from 'vue'

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
  // Kept in the claim, deliberately not read by the frame: the key that reveals the panel is ONE
  // control with one meaning, so it takes one glyph across every type (DS-7). A per-mini-app icon there
  // would say "this is a different key" about a key that is always the same one.
  icon: string
}

// A stack rather than one slot: mini-apps overlap during a switch — the incoming one mounts before the
// outgoing one is torn down — so the newest claim is the one on screen, and releasing a claim must not
// depend on the order they leave in.
const claims = ref<{ id: string; claim: RailClaim }[]>([])

// Indexed rather than `.at(-1)`: the app instance's own tsconfig targets a lib without it, and this
// file is typechecked through that instance.
export const railClaim: ComputedRef<RailClaim | null> = computed(() => claims.value[claims.value.length - 1]?.claim ?? null)

// The id is the caller's own — claim/release is driven by whether the mini-app's stage is on screen
// (see MobileMiniAppShell.vue), not by scope disposal, so a single id has to survive repeated
// claim/release pairs across a mini-app's whole mounted lifetime rather than being minted fresh each
// call.
export function claimRailHost(id: string, claim: RailClaim): void {
  claims.value = [...claims.value, { id, claim }]
}

export function releaseRailHost(id: string): void {
  claims.value = claims.value.filter((entry) => entry.id !== id)
}

// useId() is unavailable in one build target this file is typechecked through (see the historical note
// this replaced); a locally incrementing id is a fine fallback since uniqueness, not stability across
// reloads, is all a claim id needs.
let nextFallbackId = 0
export function fallbackRailId(): string {
  return `rail-${nextFallbackId++}`
}
