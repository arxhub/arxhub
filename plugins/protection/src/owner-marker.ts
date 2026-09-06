import type { Logger } from '@arxhub/core'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'

// The marker is a HINT for a UI branch and for sync's state hygiene — it is not a security boundary.
// Do not sign it and do not move it into the key store: forging this file neither decrypts anyone's
// snapshots (that needs the mnemonic) nor passes the server's signature check (that needs the auth
// key), so hardening it would buy nothing and would put a second copy of the identity where the real
// one lives.

// Inside protection's own `state/` bucket: device-local, durable, never synced.
export const OWNER_MARKER_PATH = '/owner'

// Where the same value used to live, back when sync kept its own copy to decide whether to drop a
// previous owner's repo store. Adopted once so a device that already has it does not look like an
// unknown owner — which would make the Security page ask the destructive question for no reason.
// Drop this (and adoptLegacyMarker below) once no device can still be carrying it.
export const LEGACY_SYNC_OWNER_PATH = 'state/sync/identity'

// What this device knows about who the data on disk belongs to.
export interface OwnerVerdict {
  // The owner recorded before this boot; null when nothing was recorded, or when the record could not
  // be read at all.
  previousOwner: string | null
  // This boot's identity — `keyring.authPublicKey`.
  current: string
  changed: boolean
}

// `displaced` exists only between a deliberate identity replacement and the boot that acts on it: it
// carries the owner being handed over from. Writing the new owner straight into `owner` would erase
// the very difference the next boot has to see, and sync would keep a repo store built by someone
// else — an anchor pointing at another owner's history, which fails as if the remote had been
// tampered with.
interface OwnerMarker {
  owner: string
  displaced?: string
}

function parseMarker(value: unknown): OwnerMarker | null {
  // A bare string is the legacy shape sync wrote (JSON.stringify of the key).
  if (typeof value === 'string') {
    const owner = value.trim()
    return owner ? { owner } : null
  }
  if (value == null || typeof value !== 'object') return null

  const { owner, displaced } = value as Record<string, unknown>
  if (typeof owner !== 'string' || owner.trim() === '') return null
  if (typeof displaced === 'string' && displaced.trim() !== '') return { owner: owner.trim(), displaced: displaced.trim() }
  return { owner: owner.trim() }
}

export interface OwnerRegistryArgs {
  // Thunks rather than values: nothing here is on the identity path, so an instance that binds no VFS
  // must still be able to register the plugin. The stores are resolved on first use.
  state: () => VirtualFileSystem
  root: () => VirtualFileSystem
  logger: Logger
}

// Reads, and sparingly writes, the record of who the data on this device belongs to.
//
// The marker is NOT rewritten on every boot. It is written when it is absent, and again when a
// deliberate identity replacement it recorded has been reported. A marker that is present and
// disagrees with the current identity is LEFT ALONE: after a reinstall the key store is empty and
// `loadOrCreateKeyring` mints a fresh random identity, and overwriting the marker with that would
// destroy the only record of who the files on disk belong to — the record the Security page needs to
// tell a reinstall apart from a stranger's phrase.
export class OwnerRegistry {
  private readonly args: OwnerRegistryArgs
  private readonly logger: Logger
  private verdict: Promise<OwnerVerdict> | null = null

  constructor(args: OwnerRegistryArgs) {
    this.args = args
    this.logger = args.logger.child({ name: 'OwnerRegistry' })
  }

  // Memoised: the first caller's read is what everyone gets. The read can settle the marker on its way
  // out, so a second reader doing its own read would see the settled value rather than the pre-boot
  // one — and which plugin starts first would then decide who learns that the identity changed.
  read(current: string): Promise<OwnerVerdict> {
    this.verdict ??= this.resolve(current)
    return this.verdict
  }

  // Records that the user deliberately made `publicKey` this device's owner. The only write outside a
  // first boot, and the only one that may fail loudly — the caller is mid-replacement and needs to
  // know. Reads the file rather than the memoised verdict so a second replacement in one session
  // displaces the owner set by the first.
  async claim(publicKey: string): Promise<void> {
    const file = this.args.state().file(OWNER_MARKER_PATH)
    const settled = parseMarker(await file.readJSON<unknown>(null))
    const displaced = settled != null && settled.owner !== publicKey ? settled.owner : null
    await file.writeJSON<OwnerMarker>(displaced == null ? { owner: publicKey } : { owner: publicKey, displaced })
  }

  private async resolve(current: string): Promise<OwnerVerdict> {
    try {
      const file = this.args.state().file(OWNER_MARKER_PATH)
      const marker = parseMarker(await file.readJSON<unknown>(null)) ?? (await this.adoptLegacyMarker(file))

      if (marker == null) {
        // Nothing recorded yet: whoever is here owns what is here.
        await this.settle(file, current)
        return { previousOwner: null, current, changed: false }
      }

      if (marker.displaced != null && marker.owner === current) {
        // The boot that completes a deliberate replacement. Report the handover once — this is how
        // sync learns to drop the previous owner's repo store — then retire the record.
        await this.settle(file, current)
        return { previousOwner: marker.displaced, current, changed: marker.displaced !== current }
      }

      return { previousOwner: marker.owner, current, changed: marker.owner !== current }
    } catch (error) {
      // An unreadable marker must not keep the app from starting, and it is no evidence of a changed
      // identity either — report "unknown" so nothing irreversible is decided on a failed read.
      this.logger.warn('Could not read the owner marker — treating the owner of this device as unknown', error)
      return { previousOwner: null, current, changed: false }
    }
  }

  // Reaches outside protection's own bucket on purpose: the value being adopted was written by sync
  // before identity moved here, and a device carrying it must not be mistaken for a fresh one.
  private async adoptLegacyMarker(marker: VirtualFile): Promise<OwnerMarker | null> {
    const legacy = this.args.root().file(LEGACY_SYNC_OWNER_PATH)

    let adopted: OwnerMarker | null = null
    try {
      adopted = parseMarker(await legacy.readJSON<unknown>(null))
    } catch (error) {
      this.logger.warn('Could not read the owner marker sync used to keep — ignoring it', error)
      return null
    }
    if (adopted == null) return null

    await this.settle(marker, adopted.owner)
    try {
      await legacy.delete({ force: true })
    } catch (error) {
      this.logger.warn('Adopted the owner marker sync used to keep, but could not remove the old file', error)
    }
    return adopted
  }

  private async settle(file: VirtualFile, owner: string): Promise<void> {
    try {
      await file.writeJSON<OwnerMarker>({ owner })
    } catch (error) {
      // The marker feeds a UI branch and sync's state hygiene, neither of which is worth a failed
      // boot; the next boot writes it again.
      this.logger.warn('Could not write the owner marker', error)
    }
  }
}
