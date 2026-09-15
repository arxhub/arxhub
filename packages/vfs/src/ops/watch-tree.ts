import { isNativeWatchCapable } from '../capabilities/native-watch'
import type { VfsChangeListener } from '../vfs-watcher'
import type { VirtualFileSystem } from '../virtual-file-system'

// Starts a native watch on `prefix`, or `null` when this backend has none to give — `vfs-http` cannot,
// and never will (the browser has no filesystem of its own). The caller decides what "no watch" means
// for it (log once, fall back to the periodic stat-walk) rather than this op silently doing nothing.
export async function watchTree(vfs: VirtualFileSystem, prefix: string, listener: VfsChangeListener): Promise<(() => void) | null> {
  if (!isNativeWatchCapable(vfs)) return null
  return vfs.watchTree(prefix, listener)
}
