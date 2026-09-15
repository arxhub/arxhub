import { isOpenExternallyCapable } from '../capabilities/open-externally'
import type { VirtualFileSystem } from '../virtual-file-system'

// Hands `pathname` to the system application. `true` when a capable backend did it; `false` when nobody
// can — the caller then hides or explains the action, rather than throwing at click time.
export async function openExternally(vfs: VirtualFileSystem, pathname: string): Promise<boolean> {
  if (!isOpenExternallyCapable(vfs)) return false
  await vfs.openExternally(pathname)
  return true
}

// A cheap synchronous check for a UI that has to decide whether to show the action before any await — a
// scoped vault view over a browser backend must answer "no" here so a menu never renders a dead entry.
export function canOpenExternally(vfs: VirtualFileSystem): boolean {
  return isOpenExternallyCapable(vfs) && (vfs.canOpenExternally?.() ?? true)
}
