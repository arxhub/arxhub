import type { ArxHub } from '@arxhub/core'
import { createApp, reactive } from 'vue'
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

// Follows a boot and puts a screen in front of it once it is slow enough to deserve one.
//
// The ledger starts collecting immediately, whether or not anything is ever drawn: its other reader is
// the crash screen, which needs to know what had already gone through when the boot died, and by then
// there is nothing left to subscribe to.
// Paints the pre-boot screens on the base the machine is set to.
//
// The owner's actual theme is unreachable this early by construction: ThemePlugin reads it from the
// plugin's own config, which needs the VFS, which needs the very boot these screens are standing in
// front of. The OS preference is the only signal that exists yet.
//
// It sets the base ATTRIBUTE rather than writing a dark palette here, which is what makes it honest
// rather than a second theme: `themes/default` applies through `:root:not([data-arxhub-theme])` and
// resolves every step through `data-theme`, so the screen gets the product's real dark tokens and no
// literal is introduced. ThemePlugin overwrites the attribute with the owner's choice a moment later,
// and if the boot never gets that far the crash screen keeps this one — which is the case that matters.
function applySystemBase(): void {
  const root = document.documentElement
  // Never fight a base something has already established — an instance may set one before boot.
  if (root.hasAttribute('data-theme')) return
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function watchBoot(arxhub: ArxHub): BootScreenHandle {
  // Before anything can paint, and outside the timer: a boot that fails in the first millisecond still
  // hands the page to the crash screen, and that screen deserves the right base as much as this one.
  applySystemBase()

  const ledger = reactive(emptyLedger()) as BootLedger
  const unfollow = followBoot(arxhub.boot, ledger)

  let host: HTMLElement | null = null
  let app: ReturnType<typeof createApp> | null = null
  let dismissed = false

  const timer = setTimeout(() => {
    if (dismissed) return
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(BootScreen, { ledger })
    app.mount(host)
  }, SHOW_AFTER_MS)

  return {
    ledger,
    dismiss: () => {
      dismissed = true
      clearTimeout(timer)
      unfollow()
      app?.unmount()
      host?.remove()
      app = null
      host = null
    },
  }
}
