import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { PluginVfs, RootVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { watchAuthRejections } from './auth-status'
import { KeyringExtension } from './keyring-extension'
import { manifest } from './manifest'
import { OwnerRegistry } from './owner-marker'
import AuthAlert from './ui/AuthAlert.vue'
import { openAuthRejectedDialog } from './ui/auth-dialog'
import SecuritySettingsPage from './ui/SecuritySettingsPage.vue'

export interface ProtectionPluginArgs extends PluginArgs {
  // The device keyring, resolved from client-local storage at the composition root (see
  // loadOrCreateKeyring). Injected rather than derived here so the signer can be installed BEFORE
  // ArxHub.start() — the working-tree /vfs is itself protected, so nothing can do VFS I/O until the
  // identity exists, and the mnemonic must never travel to the server VFS.
  keyring: Keyring
}

// Client-side protection plugin: publishes the device keyring via KeyringExtension so other plugins
// (sync consumes the encryption key) can reach it through the extension registry. Identity resolution
// and request-signer installation happen in the instance's main.ts, not here.
export class ProtectionPlugin extends Plugin {
  private readonly keyring: Keyring
  private unwatchRejections: (() => void) | null = null

  constructor(args: ProtectionPluginArgs) {
    super(args, manifest)
    this.keyring = args.keyring
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(KeyringExtension, () => ({
      keyring: this.keyring,
      // Identity is protection's business, so the record of who the data on disk belongs to lives in
      // protection's own device-local state. Root is reached only to adopt the copy sync used to keep.
      owners: new OwnerRegistry({
        state: () => ctx.services.get(PluginVfs).state,
        root: () => ctx.services.get(RootVfs),
        logger: this.logger,
      }),
    }))
    // In create(), not start(): every plugin's config read happens during start(), so a subscription
    // made there would miss the first refusals — the ones that explain why the boot went wrong. The
    // dialog goes through the modal registry, so opening it here (before anything is mounted) is fine —
    // ModalsProvider renders it as soon as the shell is up.
    this.unwatchRejections = watchAuthRejections(() => openAuthRejectedDialog())
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'security', title: 'Security', icon: 'lu:shield', order: 1, component: markRaw(SecuritySettingsPage) })

    // A server refusing this device is a standing, whole-app condition — the same class as maintenance
    // mode. The click opens the explanation; it does not clear anything, because neither fix is
    // available from here (see the 401 note in AGENTS.md).
    ctx.extensions.get(ShellExtension).status.register({ id: 'arxhub.protection', kind: 'status', component: markRaw(AuthAlert) })
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatchRejections?.()
    this.unwatchRejections = null
    await super.stop(ctx)
  }
}
