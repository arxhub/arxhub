// Replacing a file's content only if it still holds what the caller last saw. This is the primitive a
// pointer file needs (the repository head: the address of the newest snapshot) when more than one
// writer shares the store — two tabs, two Playwright workers, two devices behind one server — because
// a read followed by a write leaves a gap another writer's write can land in, and whichever lands
// second silently wins. `expected === null` means the file must not exist yet (a seed).
//
// A mismatch is an ANSWER (`false`), never an error: the caller re-reads, rebuilds against what is
// there now and tries again, which is the whole protocol. What "atomic" means depends on the backend
// — see `ops/compare-and-swap.ts` for the fallback's scope and each backend for its own.
export interface CompareAndSwapCapable {
  compareAndSwap(pathname: string, expected: Uint8Array | null, next: Uint8Array): Promise<boolean>
}

export function isCompareAndSwapCapable(vfs: unknown): vfs is CompareAndSwapCapable {
  return vfs != null && typeof (vfs as CompareAndSwapCapable).compareAndSwap === 'function'
}
