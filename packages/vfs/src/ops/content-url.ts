import { isContentUrlCapable } from '../capabilities/content-url'
import type { VirtualFileSystem } from '../virtual-file-system'

// The URL an element can load `pathname` from, or null when this backend has none to give.
export async function contentUrlOf(vfs: VirtualFileSystem, pathname: string): Promise<string | null> {
  return isContentUrlCapable(vfs) ? vfs.contentUrl(pathname) : null
}
