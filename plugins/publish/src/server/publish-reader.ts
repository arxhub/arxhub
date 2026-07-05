import { type SnapshotFile, type SyncRemote, VfsSyncRemote } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { PublishManifest } from '../publish-manifest'

const GET_BATCH = 32
const decoder = new TextDecoder()

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// Read side of the publish store: reassembles whole files from the manifest + plaintext chunks.
// Backed by the SAME content-addressed object store the /publish upload routes write to (a
// VfsSyncRemote over `public/`), so the server needs no separate index — the manifest IS the index.
export class PublishReader {
  private readonly store: SyncRemote

  constructor(vfs: VirtualFileSystem) {
    this.store = new VfsSyncRemote(vfs)
  }

  // The current published manifest, or null if nothing has been published yet.
  async getManifest(): Promise<PublishManifest | null> {
    const head = await this.store.getHead()
    if (head == null) return null
    const objects = await this.store.getObjects([head])
    const bytes = objects.get(head)
    if (bytes == null) return null
    return JSON.parse(decoder.decode(bytes)) as PublishManifest
  }

  // Reassemble one file's bytes from its chunk list, or null if the path is not a published file.
  async readFile(manifest: PublishManifest, pathname: string): Promise<Uint8Array | null> {
    const file: SnapshotFile | undefined = manifest.files[pathname]
    if (file == null) return null

    const parts: Uint8Array[] = []
    const hashes = file.chunks.map((c) => c.hash)
    for (let i = 0; i < hashes.length; i += GET_BATCH) {
      const batch = hashes.slice(i, i + GET_BATCH)
      const objects = await this.store.getObjects(batch)
      for (const hash of batch) {
        const bytes = objects.get(hash)
        // A referenced chunk missing from the store means a broken/partial publish; treat the whole
        // file as unavailable rather than serving a truncated document.
        if (bytes == null) return null
        parts.push(bytes)
      }
    }
    return concat(parts)
  }

  // Direct children (files + synthetic folders) of a manifest path, for an auto-generated index when
  // a folder URL has no index page of its own.
  childrenOf(manifest: PublishManifest, prefix: string): string[] {
    const base = prefix === '' ? '' : `${prefix}/`
    const seen = new Set<string>()
    for (const path of Object.keys(manifest.files)) {
      if (!path.startsWith(base)) continue
      const rest = path.slice(base.length)
      const slash = rest.indexOf('/')
      seen.add(slash === -1 ? rest : rest.slice(0, slash))
    }
    return [...seen].sort()
  }
}
