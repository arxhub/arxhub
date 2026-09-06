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
// One thing this screen cannot do, and it is worth knowing rather than wondering about: the theme is
// applied by ThemePlugin, which is itself a plugin, so nothing has chosen one yet while this is up. It
// renders on the default (light) tokens whatever the owner picked — as the crash screen beside it does,
// for the same reason.
export function watchBoot(arxhub: ArxHub): BootScreenHandle {
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
