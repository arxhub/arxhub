import { AppError, defineAppError } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static } from '@sinclair/typebox'

export const vaultNotClearedSchema = defineAppError('VaultNotClearedError', 500)

export const vaultNotCleared = (remaining: readonly string[], cause?: unknown) =>
  new AppError<Static<typeof vaultNotClearedSchema>>(
    {
      code: 'VaultNotClearedError',
      statusCode: 500,
      title: 'The vault was not cleared',
      message:
        `${remaining.length} entr${remaining.length === 1 ? 'y is' : 'ies are'} still in the vault: ` +
        `${remaining.slice(0, 10).join(', ')}. The device's identity has NOT been changed — nothing was handed over.`,
    },
    cause,
  )

// True only when the vault is known to hold nothing — the conservative direction: an emptiness answer
// is what decides whether the user is asked before an irreversible change.
export async function isVaultEmpty(vault: VirtualFileSystem): Promise<boolean> {
  return (await vault.list('/')).length === 0
}

// Deletes the vault working tree. The most destructive operation in the product: it runs only behind
// an explicit choice, and it must never report success on a partial delete — the caller is about to
// hand the device to a different owner on the strength of it.
//
// Entry by entry rather than one recursive delete of the root, so a backend that refuses one path
// still clears the rest and the failure can name what survived. `force` is what makes each delete
// idempotent, and it is also why the result is verified by asking the filesystem again instead of by
// trusting the calls: a swallowed error would otherwise pass for a clean wipe.
export async function clearVaultWorkingTree(vault: VirtualFileSystem): Promise<void> {
  let firstFailure: unknown

  for (const entry of await vault.list('/')) {
    try {
      await vault.delete(entry.pathname, { recursive: true, force: true })
    } catch (error) {
      firstFailure ??= error
    }
  }

  const remaining = (await vault.list('/')).map((it) => it.pathname)
  if (remaining.length > 0) throw vaultNotCleared(remaining, firstFailure)
}
