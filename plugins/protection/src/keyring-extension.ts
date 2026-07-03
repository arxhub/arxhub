import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'

// Holds the user's derived keyring once a valid mnemonic is configured. Other plugins consume it via
// the extension registry — e.g. sync reads `keyring?.encryptionKey` to encrypt content before it
// reaches the remote. Null until an identity is established (no mnemonic yet, or an invalid one).
export class KeyringExtension extends Extension {
  keyring: Keyring | null = null

  constructor(args: ExtensionArgs) {
    super(args)
  }
}
