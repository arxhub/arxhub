import { type ArxHub, type BootFailure, bootFailures, type PluginInfo } from '@arxhub/core'
import { createApp } from 'vue'
import type { BootLedger } from './boot-ledger'
import type { BootPolicy } from './boot-policy'
import { watchBoot } from './boot-screen'
import CrashScreen from './ui/CrashScreen.vue'

export interface CrashScreenOptions {
  // Whatever ArxHub.start() rejected with.
  error: unknown
  policy: BootPolicy
  // The roster from `arxhub.catalog` — every registered plugin, whether or not this boot ran it.
  catalog: readonly PluginInfo[]
  maintenance: boolean
  // How far the boot got before it died: which plugins were through, which was in the middle of a phase,
  // which never got a turn. The error alone names one plugin and says nothing about the twenty around it.
  ledger?: BootLedger
}

// Takes over the page when the boot died, names what broke and offers to switch it off.
//
// Resolves ONLY when the user chooses to go on into the half-booted app, which is offered when every
// failure happened in start(): configure() has already registered every UI contribution by then, so
// the shell still mounts and the app is usable-minus-one-plugin. Every other way out of this screen
// reloads the page, so the promise simply never settles.
export function showCrashScreen(options: CrashScreenOptions): Promise<void> {
  const failures = bootFailures(options.error) ?? []
  return new Promise<void>((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(CrashScreen, {
      error: options.error,
      failures,
      catalog: options.catalog,
      ledger: options.ledger ?? null,
      policy: options.policy,
      maintenance: options.maintenance,
      continuable: continuable(failures),
      onContinue: () => {
        app.unmount()
        host.remove()
        resolve()
      },
    })
    app.mount(host)
  })
}

// Boots the app, and hands the page to the crash screen if that fails. Resolves once it is safe to
// mount: either the boot went through, or the user chose to carry on into a half-booted app. This is
// what an instance's composition root calls instead of `arxhub.start()`.
export async function startWithCrashScreen(arxhub: ArxHub, policy: BootPolicy): Promise<void> {
  // Subscribed before start() rather than inside the failure path: by the time a boot has died there is
  // nothing left to listen to, and what had already gone through is exactly what the crash screen wants.
  // On a boot fast enough not to need a progress screen, this costs one timer that never fires.
  const boot = watchBoot(arxhub)
  try {
    await arxhub.start()
    boot.dismiss()
  } catch (error) {
    boot.dismiss()
    arxhub.logger.error('ArxHub failed to boot', error)
    await showCrashScreen({ error, policy, catalog: arxhub.catalog, maintenance: arxhub.maintenance, ledger: boot.ledger })
  }
}

// A start() failure leaves a mountable app behind; anything earlier does not — a plugin that died in
// create()/configure() never registered its half of the UI, and offering to carry on would just trade
// this screen for a blank one.
export function continuable(failures: BootFailure[]): boolean {
  return failures.length > 0 && failures.every((it) => it.phase === 'start')
}
