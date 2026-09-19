import { illegalState } from '@arxhub/errors'
import { readRange, resolveRange } from './ops/read-range'
import type { FileHead, VirtualFileSystem } from './virtual-file-system'

// A stable random-access view used by consumers that issue several related range requests (pdf.js,
// media containers). Implementations may pin stronger state than a plain VFS can: the pending-file
// implementation pins a repository snapshot, while this local adapter pins the opening stat and
// refuses to mix bytes after the file changes.
export interface RangeReader {
  head(): Promise<FileHead>
  readRange(offset: number, length?: number): Promise<Uint8Array>
}

export async function openRangeReader(vfs: VirtualFileSystem, pathname: string): Promise<RangeReader> {
  const pinned = await vfs.head(pathname)

  return {
    head: async () => pinned,
    readRange: async (offset, length) => {
      // Validate before touching the backend. Besides producing the expected slice bounds, this means
      // a bad pdf.js request cannot cause network or disk work first.
      const { start, end } = resolveRange(pinned.size, offset, length)
      const current = await vfs.head(pathname)
      if (current.size !== pinned.size || current.modifiedAt !== pinned.modifiedAt) {
        throw illegalState(`The file changed while it was being read: ${pathname}`)
      }

      const bytes = await readRange(vfs, pathname, offset, length)
      if (bytes.byteLength !== end - start) {
        throw illegalState(`Short range read for ${pathname}: expected ${end - start} bytes, got ${bytes.byteLength}`)
      }
      const after = await vfs.head(pathname)
      if (after.size !== pinned.size || after.modifiedAt !== pinned.modifiedAt) {
        throw illegalState(`The file changed while it was being read: ${pathname}`)
      }
      return bytes
    },
  }
}
