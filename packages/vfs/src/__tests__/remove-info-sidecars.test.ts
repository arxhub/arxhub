import { describe, expect, test } from 'vitest'
import { removeInfoSidecars } from '../migrations/remove-info-sidecars'
import { MemoryFileSystem } from './memory-file-system'

describe('removeInfoSidecars', () => {
  test('removes every sidecar anywhere in the tree, keeps everything else, and marks the store', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('vault/notes/a.md')
    fs.seed('vault/notes/a.md.arxmeta', '{"hash":"x"}')
    fs.seed('repo/objects/aa/bb/aabb.arxmeta', '{}')
    fs.seed('repo/objects/aa/bb/aabb')
    fs.seed('storage/theme/config.toml.arxmeta', '{}')

    expect(await removeInfoSidecars(fs)).toBe(3)

    expect([...fs.files.keys()].sort()).toEqual(['repo/objects/aa/bb/aabb', 'state/vfs/sidecars-removed', 'vault/notes/a.md'])
  })

  test('a marked store is not walked again', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('state/vfs/sidecars-removed', '2026-09-14T00:00:00.000Z')
    fs.seed('vault/late.md.arxmeta', '{}')

    expect(await removeInfoSidecars(fs)).toBe(0)
    expect(fs.files.has('vault/late.md.arxmeta')).toBe(true)
  })
})
