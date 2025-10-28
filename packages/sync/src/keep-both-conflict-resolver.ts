import { join } from 'path'
import type { ConflictResolver } from 'src/types'

export const keepBothConflictResolver: ConflictResolver = async (vfs, _, incoming) => {
  const hash = await incoming.hash('sha256')
  const file = vfs.file(join(incoming.path, `${hash.slice(0, 8).toLowerCase()}-${incoming.name}`))

  const writable = await file.writable()
  const readable = await incoming.readable()
  await readable.pipeTo(writable)
}
