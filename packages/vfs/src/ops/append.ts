import { isAppendCapable } from '../capabilities/append'
import type { VirtualFileSystem } from '../virtual-file-system'

// Appends `content` to the file at `pathname`. Uses the backend's native append when available
// (e.g. NodeFileSystem via fs.appendFile); otherwise falls back to a read-modify-write under the
// file lock so concurrent appends don't clobber each other. The file is created if absent.
export async function appendEntry(vfs: VirtualFileSystem, pathname: string, content: Uint8Array): Promise<void> {
  if (isAppendCapable(vfs)) {
    return vfs.append(pathname, content)
  }
  await vfs.lock(pathname, async () => {
    const prev = (await vfs.exists(pathname)) ? await vfs.read(pathname) : new Uint8Array(0)
    const combined = new Uint8Array(prev.length + content.length)
    combined.set(prev, 0)
    combined.set(content, prev.length)
    await vfs.write(pathname, combined)
  })
}
