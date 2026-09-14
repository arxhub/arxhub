import { validation } from '@arxhub/errors'
import { isRangeCapable } from '../capabilities/range'
import type { VirtualFileSystem } from '../virtual-file-system'

export interface ResolvedRange {
  start: number
  end: number
}

// The one place the range grammar is interpreted, so a backend and the fallback cannot disagree on what
// `offset: -10` or a slice past the end means. Backends call this with the file size they already know
// and read exactly [start, end). Rejects a range that is not a range (a fraction, a NaN, a suffix with a
// length) rather than guessing — every caller is a program, and a program that passes NaN has a bug.
export function resolveRange(size: number, offset: number, length?: number): ResolvedRange {
  if (!Number.isInteger(offset)) throw validation(`Range offset must be an integer, got ${offset}`)
  if (length !== undefined && (!Number.isInteger(length) || length < 0))
    throw validation(`Range length must be a non-negative integer, got ${length}`)
  if (offset < 0) {
    if (length !== undefined) throw validation('A suffix range takes no length')
    return { start: Math.max(0, size + offset), end: size }
  }
  const start = Math.min(offset, size)
  const end = length === undefined ? size : Math.min(start + length, size)
  return { start, end }
}

// Reads [offset, offset+length) of `pathname` — natively where the backend can seek, otherwise by reading
// the whole file and cutting. The fallback `slice`s rather than `subarray`s on purpose: a view would pin
// the whole file's buffer in memory for as long as the caller holds the slice, which for a range read is
// the one thing the caller was trying to avoid.
export async function readRange(vfs: VirtualFileSystem, pathname: string, offset: number, length?: number): Promise<Uint8Array> {
  if (isRangeCapable(vfs)) {
    return vfs.readRange(pathname, offset, length)
  }
  const bytes = await vfs.read(pathname)
  const { start, end } = resolveRange(bytes.byteLength, offset, length)
  return bytes.slice(start, end)
}
