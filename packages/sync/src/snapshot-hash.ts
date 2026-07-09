import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { stableStringify } from '@arxhub/stdlib/record/stable-stringify'
import type { SnapshotFile } from './types'

// A snapshot's address commits to its content AND its place in history — files and parent — like a
// git commit id. Hashing files alone would let two snapshots with identical trees but different
// parents collide at one address, so history could be rewritten under an unchanged name and the
// engine's ancestry checks (base-finding, rollback detection) would be anchored to nothing.
// stableStringify keeps the form canonical across devices regardless of key insertion order.
export function snapshotHash(parent: string | null, files: Record<string, SnapshotFile>): string {
  return sha256(stableStringify({ files, parent }))
}
