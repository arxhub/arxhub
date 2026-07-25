import type { Ref } from 'vue'
import { useMediaQuery } from './useMediaQuery'

// One breakpoint for the whole product. The frame, the overlays and the workspace all have to agree
// on "narrow", or the app ends up half in one mode and half in the other at some widths.
export const MOBILE_BREAKPOINT = 640

export function useIsMobile(): Ref<boolean> {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`)
}
