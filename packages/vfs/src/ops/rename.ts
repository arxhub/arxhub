import { join } from '@arxhub/path'
import { isRenameCapable } from '../capabilities/rename'
import type { VirtualFileSystem } from '../virtual-file-system'

export async function renameEntry(vfs: VirtualFileSystem, src: string, dest: string): Promise<void> {
  if (isRenameCapable(vfs)) {
    return vfs.rename(src, dest)
  }
  await copyEntry(vfs, src, dest)
  await vfs.delete(src, { recursive: true, force: true })
}

async function copyEntry(vfs: VirtualFileSystem, src: string, dest: string): Promise<void> {
  for await (const file of vfs.walk(src)) {
    const rel = file.pathname.slice(src.length)
    const bytes = await vfs.read(file.pathname)
    await vfs.write(join(dest, rel), bytes)
  }
}
