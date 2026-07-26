import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { markRaw } from 'vue'
import { watchAuthRejections } from './auth-status'
import { KeyringExtension } from './keyring-extension'
import { manifest } from './manifest'
import AuthFooter from './ui/AuthFooter.vue'
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
    ctx.extensions.register(KeyringExtension, () => ({ keyring: this.keyring }))
    // In create(), not start(): every plugin's config read happens during start(), so a subscription
    // made there would miss the first refusals — the ones that explain why the boot went wrong. The
    // dialog goes through the modal registry, so opening it here (before anything is mounted) is fine —
    // ModalsProvider renders it as soon as the shell is up.
    this.unwatchRejections = watchAuthRejections(() => openAuthRejectedDialog())
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'security', title: 'Security', order: 1, component: markRaw(SecuritySettingsPage) })

    // Left region, next to maintenance mode: a server refusing this device is the same class of standing,
    // whole-app condition, and it must not be crowded out by the right-hand status items.
    ctx.extensions.get(ShellExtension).footer.register({ id: 'arxhub.protection', component: markRaw(AuthFooter), region: 'left' })
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatchRejections?.()
    this.unwatchRejections = null
    await super.stop(ctx)
  }
}
