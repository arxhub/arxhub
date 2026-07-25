import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { markRaw } from 'vue'
import { KeyringExtension } from './keyring-extension'
import { manifest } from './manifest'
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

  constructor(args: ProtectionPluginArgs) {
    super(args, manifest)
    this.keyring = args.keyring
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(KeyringExtension, () => ({ keyring: this.keyring }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'security', title: 'Security', order: 1, component: markRaw(SecuritySettingsPage) })
  }
}
