import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { KeyStore } from './keystore'

export interface KeyStoreExtensionArgs extends ExtensionArgs {
  keystore: KeyStore
}

// Publishes the device KeyStore to other plugins via the extension registry, so runtime code (e.g. a
// Security/key-management UI) can read, rotate, or clear stored secrets. The store itself is built at
// the composition root and also used there (pre-start) to resolve the identity.
export class KeyStoreExtension extends Extension {
  readonly keystore: KeyStore

  constructor(args: KeyStoreExtensionArgs) {
    super(args)
    this.keystore = args.keystore
  }
}
