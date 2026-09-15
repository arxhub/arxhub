import { hasErrorCode } from '@arxhub/errors'
import { isCompareAndSwapCapable } from '../capabilities/compare-and-swap'
import type { VirtualFileSystem } from '../virtual-file-system'

// Content equality with `null` standing for "no file". Exported because a backend's own
// compareAndSwap has to make the same decision, and two definitions of "equal" would be one too many.
export function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

// Writes `next` to `pathname` only if the file currently holds `expected` (`null`: does not exist).
// Natively where the backend has one; otherwise read-compare-write under the backend's own path lock.
//
// The fallback is atomic PER VFS INSTANCE only: `vfs.lock` is an in-memory AsyncLock, so two instances
// over one directory — or two processes — are not serialised by it. A backend whose writers can share
// a store from outside one instance has to declare the capability and hold a wider lock itself
// (NodeFileSystem: process-wide; HttpFileSystem: the server's). Inside the critical section the RAW
// `vfs.write` is used, not `VirtualFile.write()`: that one takes the same per-path lock, and the lock
// is not re-entrant.
export async function compareAndSwap(
  vfs: VirtualFileSystem,
  pathname: string,
  expected: Uint8Array | null,
  next: Uint8Array,
): Promise<boolean> {
  if (isCompareAndSwapCapable(vfs)) {
    return vfs.compareAndSwap(pathname, expected, next)
  }
  return vfs.lock(pathname, async () => {
    let current: Uint8Array | null
    try {
      current = await vfs.read(pathname)
    } catch (error) {
      if (!hasErrorCode(error, 'FileNotFound')) throw error
      current = null
    }
    if (!sameBytes(current, expected)) return false
    await vfs.write(pathname, next)
    return true
  })
}
