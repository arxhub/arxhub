import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { illegalState } from '@arxhub/errors'
import { afterEach, beforeEach } from 'vitest'

// A fresh directory per test, removed afterwards: a root inside the source tree left the tests'
// own output behind in the working copy (and deleted the files someone had committed there).
export function tempRoot(name: string): () => string {
  let dir: string | null = null
  beforeEach(async () => {
    dir = await mkdtemp(`${tmpdir()}/arxhub-vfs-node-${name}-`)
  })
  afterEach(async () => {
    if (dir) await rm(dir, { force: true, recursive: true })
    dir = null
  })
  return () => {
    if (!dir) throw illegalState('tempRoot() is only available inside a test')
    return dir
  }
}
