import type { VfsChangeListener } from '../vfs-watcher'

// A backend that can ask the OS to report changes under a prefix, rather than waiting to be asked to
// look. Only a backend that IS local disk declares this — `vfs-http` never will, because the browser
// has no filesystem of its own to watch. Unlike `RangeCapable`/`RenameCapable` there is no fallback
// implementation possible (there is nothing to poll from in here), so the interface itself always
// succeeds once a backend is capable; `ops/watch-tree.ts` is what a caller uses when it does not know
// whether the backend has one.
export interface NativeWatchCapable {
  // Watches `prefix` (in this backend's own coordinates) and calls `listener` for every write, delete
  // or rename under it. Resolves to the function that stops watching.
  watchTree(prefix: string, listener: VfsChangeListener): Promise<() => void>
}

export function isNativeWatchCapable(vfs: unknown): vfs is NativeWatchCapable {
  return typeof (vfs as NativeWatchCapable).watchTree === 'function'
}
