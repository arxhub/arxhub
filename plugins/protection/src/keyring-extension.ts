import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'

export interface KeyringExtensionArgs extends ExtensionArgs {
  keyring?: Keyring
}

// Publishes the device's derived keyring to other plugins via the extension registry — e.g. sync reads
// `keyring?.encryptionKey` to encrypt content before it reaches the remote. Populated at registration
// from the identity resolved at the composition root; null only if no identity was injected.
export class KeyringExtension extends Extension {
  keyring: Keyring | null

  constructor(args: KeyringExtensionArgs) {
    super(args)
    this.keyring = args.keyring ?? null
  }
}
