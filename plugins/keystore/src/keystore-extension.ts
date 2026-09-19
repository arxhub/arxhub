import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { KeyStore } from './keystore'

export interface KeyStoreExtensionArgs extends ExtensionArgs {
  keystore: KeyStore
  // When true, secrets must stay encrypted at rest — shipped `app`/`client` builds (A-18). The Security
  // page uses this to hide "remove lock", which would otherwise put the mnemonic back in plaintext.
  deviceLockRequired?: boolean
}

// Publishes the device KeyStore to other plugins via the extension registry, so runtime code (e.g. a
// Security/key-management UI) can read, rotate, or clear stored secrets. The store itself is built at
// the composition root and also used there (pre-start) to resolve the identity.
export class KeyStoreExtension extends Extension {
  readonly keystore: KeyStore
  readonly deviceLockRequired: boolean

  constructor(args: KeyStoreExtensionArgs) {
    super(args)
    this.keystore = args.keystore
    this.deviceLockRequired = args.deviceLockRequired ?? false
  }
}
