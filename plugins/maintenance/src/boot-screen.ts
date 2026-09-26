import type { ArxHub } from '@arxhub/core'
import { type GateHandle, mountGate, type ShellFrame } from '@arxhub/uikit/hooks'
import { reactive } from 'vue'
import { type BootLedger, emptyLedger, followBoot } from './boot-ledger'
import BootScreen from './ui/BootScreen.vue'

// How long a boot may take before it is worth saying anything. Measured on the dev stand, a boot is
// through in roughly 300-400 ms, so a lower threshold buys a screen that appears with fifteen of sixteen
// plugins already green and is gone a tenth of a second later — a flicker, not an explanation. Above
// half a second the opposite is true: waiting at a blank page with nothing said is the worse failure.
const SHOW_AFTER_MS = 500

export interface BootScreenHandle {
  ledger: BootLedger
  // Takes the screen down. Safe before it was ever shown — that is the ordinary fast-boot path.
  dismiss: () => void
}

// A fallback for a bundle built without `themeBoot()` (toolchains/vite): that script normally puts the
// base on <html> before any module — the theme this device applied last, else the system's light/dark —
// and then this is a no-op. Without it, the OS preference is the only signal there is this early: the
// owner's configured theme needs the VFS, which needs the very boot these screens stand in front of.
//
// It sets the base ATTRIBUTE rather than writing a dark palette here, so the screen gets the product's
// real dark tokens and no literal is introduced; ThemePlugin overwrites it with the owner's choice.
function applySystemBase(): void {
  const root = document.documentElement
  if (root.hasAttribute('data-theme')) return
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
}

// Follows a boot and puts a screen in front of it once it is slow enough to deserve one.
//
// The ledger starts collecting immediately, whether or not anything is ever drawn: its other reader is
// the crash screen, which needs to know what had already gone through when the boot died, and by then
// there is nothing left to subscribe to.
//
// `frame` is the instance's own choice: this screen is a Vue app of its own, mounted before the shell
// that would otherwise provide it, and without it every uikit role would take the desktop geometry.
export function watchBoot(arxhub: ArxHub, frame: ShellFrame = 'desktop'): BootScreenHandle {
  // Before anything can paint, and outside the timer: a boot that fails in the first millisecond still
  // hands the page to the crash screen, and that screen deserves the right base as much as this one.
  applySystemBase()

  const ledger = reactive(emptyLedger()) as BootLedger
  const unfollow = followBoot(arxhub.boot, ledger)

  let gate: GateHandle | null = null
  let dismissed = false

  const timer = setTimeout(() => {
    if (dismissed) return
    gate = mountGate(BootScreen, { ledger }, frame)
  }, SHOW_AFTER_MS)

  return {
    ledger,
    dismiss: () => {
      dismissed = true
      clearTimeout(timer)
      unfollow()
      gate?.dispose()
      gate = null
    },
  }
}
