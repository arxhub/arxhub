import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearVaultWorkingTree, isVaultEmpty } from '../vault-reset'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

// A backend that accepts a delete and does nothing — the shape a fail-loudly check exists for. It is
// not hypothetical: NodeFileSystem's `force` swallows the underlying error, so a wipe that quietly
// failed would look exactly like this from the caller's side.
class UndeletableFileSystem extends ScopedFileSystem {
  override async delete(_pathname: string): Promise<void> {}
}

describe('clearVaultWorkingTree', () => {
  let dir: string
  let root: VirtualFileSystem
  let vault: VirtualFileSystem

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'arxhub-vault-'))
    root = new NodeFileSystem(dir, silent)
    vault = new ScopedFileSystem(root, 'vault')

    await vault.file('/notes/journal.md').writeText('# day one')
    await vault.file('/notes/deep/nested.md').writeText('nested')
    await vault.file('/top.md').writeText('top')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('leaves nothing behind, files and directories alike', async () => {
    expect(await isVaultEmpty(vault)).toBe(false)

    await clearVaultWorkingTree(vault)

    expect(await isVaultEmpty(vault)).toBe(true)
    expect(await root.exists('vault/notes/journal.md')).toBe(false)
    expect(await root.exists('vault/notes/deep')).toBe(false)
  })

  it('deletes nothing outside the vault', async () => {
    // The device keeps its identity, its config and its sync state next to the vault, and the branch
    // that runs this is about content only.
    await root.file('state/protection/owner').writeJSON('xpub-owner')
    await root.file('storage/sync/settings.toml').writeText('serverUrl = ""')

    await clearVaultWorkingTree(vault)

    expect(await root.exists('state/protection/owner')).toBe(true)
    expect(await root.exists('storage/sync/settings.toml')).toBe(true)
  })

  it('succeeds on an already empty vault instead of reporting a failure', async () => {
    await clearVaultWorkingTree(vault)

    await expect(clearVaultWorkingTree(vault)).resolves.toBeUndefined()
  })

  it('fails loudly, naming what survived, when the tree is still there afterwards', async () => {
    const stubborn = new UndeletableFileSystem(root, 'vault')

    const error = await clearVaultWorkingTree(stubborn).catch((e) => e)

    expect(hasErrorCode(error, 'VaultNotClearedError')).toBe(true)
    expect(error.body.message).toContain('notes')
    // The caller reads this as "nothing was handed over" and must be able to trust it: the files are
    // all still there.
    expect(await isVaultEmpty(vault)).toBe(false)
  })
})
