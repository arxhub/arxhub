import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { Keyring } from '@arxhub/crypto'
import type { OwnerRegistry, OwnerVerdict } from './owner-marker'

export interface KeyringExtensionArgs extends ExtensionArgs {
  keyring?: Keyring
  owners?: OwnerRegistry
}

// Publishes the device's derived keyring to other plugins via the extension registry — e.g. sync reads
// `keyring?.encryptionKey` to encrypt content before it reaches the remote. Populated at registration
// from the identity resolved at the composition root; null only if no identity was injected.
//
// It also publishes the verdict on WHO the data on this device belongs to (see OwnerRegistry). That
// used to be sync's own file, which made sync the owner of a question about identity; it is answered
// here, once, and sync only acts on it.
export class KeyringExtension extends Extension {
  keyring: Keyring | null
  private readonly owners: OwnerRegistry | null

  constructor(args: KeyringExtensionArgs) {
    super(args)
    this.keyring = args.keyring ?? null
    this.owners = args.owners ?? null
  }

  // Memoised inside the registry: whoever asks first performs the read, and everyone else gets that
  // same captured value — so plugin start order cannot decide who sees the pre-boot marker. Null when
  // this device has no identity at all, in which case there is nothing to compare anything against.
  owner(): Promise<OwnerVerdict | null> {
    if (this.keyring == null || this.owners == null) return Promise.resolve(null)
    return this.owners.read(this.keyring.authPublicKey)
  }

  // Records a deliberate identity replacement the user has just completed. The next boot reports the
  // handover once (so sync drops the previous owner's state) and then settles.
  async claimOwner(publicKey: string): Promise<void> {
    if (this.owners == null) {
      // Not fatal: without a marker the next boot cannot tell the owner changed, and everything that
      // reads it errs towards asking rather than towards destroying.
      this.logger.warn('No owner marker store — the identity handover was not recorded')
      return
    }
    await this.owners.claim(publicKey)
  }
}
