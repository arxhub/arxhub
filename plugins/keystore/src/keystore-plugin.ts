import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import type { KeyStore } from './keystore'
import { KeyStoreExtension } from './keystore-extension'
import { manifest } from './manifest'

export interface KeyStorePluginArgs extends PluginArgs {
  // The KeyStore built at the composition root (also used there before start() to resolve identity).
  keystore: KeyStore
  // Mirrors boot's `requireLock` for the same instance — see KeyStoreExtension.
  deviceLockRequired?: boolean
}

// Publishes the injected KeyStore via KeyStoreExtension. Thin by design — the store is constructed and
// primarily consumed in the instance's main.ts (identity must resolve before ArxHub.start()); the
// extension exists so runtime plugins/UI can reach the same store.
export class KeyStorePlugin extends Plugin {
  private readonly keystore: KeyStore
  private readonly deviceLockRequired: boolean

  constructor(args: KeyStorePluginArgs) {
    super(args, manifest)
    this.keystore = args.keystore
    this.deviceLockRequired = args.deviceLockRequired ?? false
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(KeyStoreExtension, () => ({
      keystore: this.keystore,
      deviceLockRequired: this.deviceLockRequired,
    }))
  }
}
