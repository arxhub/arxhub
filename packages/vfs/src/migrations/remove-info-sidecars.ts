import type { VirtualFileSystem } from '../virtual-file-system'

const SIDECAR_SUFFIX = '.arxmeta'
// Under state/: device-local by convention, and — for a browser instance whose root IS the server —
// shared by every client of that root, which is exactly right: the sweep is about the store, not
// about who ran it.
const MARKER = 'state/vfs/sidecars-removed'

// One-time sweep of the `.arxmeta` sidecars every write used to leave beside its file. Until this
// change the backends hid them from listings; with the hiding gone they would surface as files — one
// under every note in the tree, and one under every object in a server's repo store — so the sweep
// has to have happened before anyone lists. Idempotent through the marker; a walk that is interrupted
// simply runs again next boot. Returns how many it removed, for the log.
export async function removeInfoSidecars(root: VirtualFileSystem): Promise<number> {
  if (await root.exists(MARKER)) return 0
  let removed = 0
  for await (const file of root.walk('')) {
    if (!file.pathname.endsWith(SIDECAR_SUFFIX)) continue
    await root.delete(file.pathname, { force: true })
    removed++
  }
  await root.write(MARKER, new TextEncoder().encode(new Date().toISOString()))
  return removed
}
