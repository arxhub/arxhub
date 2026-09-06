import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@arxhub/core'
import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LEGACY_SYNC_OWNER_PATH, OWNER_MARKER_PATH, OwnerRegistry } from '../owner-marker'

const OWNER = 'xpub-owner'
const MINTED = 'xpub-minted-after-reinstall'
const STRANGER = 'xpub-stranger'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

describe('OwnerRegistry', () => {
  let dir: string
  let root: VirtualFileSystem
  let state: VirtualFileSystem

  // A fresh registry is a fresh boot: the memoisation is per instance.
  const boot = () => new OwnerRegistry({ state: () => state, root: () => root, logger: silent })

  const marker = () => state.file(OWNER_MARKER_PATH).readJSON<unknown>(null)

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'arxhub-owner-'))
    root = new NodeFileSystem(dir, silent)
    state = new ScopedFileSystem(root, 'state/protection')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('records the owner on a first boot, when there is nothing to contradict', async () => {
    expect(await boot().read(OWNER)).toEqual({ previousOwner: null, current: OWNER, changed: false })
    expect(await marker()).toEqual({ owner: OWNER })
  })

  it('reports no change when the marker names the identity that is running', async () => {
    await boot().read(OWNER)

    expect(await boot().read(OWNER)).toEqual({ previousOwner: OWNER, current: OWNER, changed: false })
  })

  it('LEAVES a marker that disagrees with the current identity', async () => {
    await boot().read(OWNER)

    // The reinstall: the key store is empty, loadOrCreateKeyring mints a random identity. Overwriting
    // the marker with it would destroy the only record of who the files on disk belong to.
    expect(await boot().read(MINTED)).toEqual({ previousOwner: OWNER, current: MINTED, changed: true })
    expect(await marker()).toEqual({ owner: OWNER })

    // And it survives every subsequent boot, not just the first one.
    expect(await boot().read(MINTED)).toEqual({ previousOwner: OWNER, current: MINTED, changed: true })
    expect(await marker()).toEqual({ owner: OWNER })
  })

  it('hands every caller of one boot the same verdict, whoever reads first', async () => {
    const registry = boot()

    const [first, second] = await Promise.all([registry.read(OWNER), registry.read(OWNER)])
    // A later reader must not see the value the first read settled — plugin start order would then
    // decide who learns the identity changed.
    const third = await registry.read(OWNER)

    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  describe('migration from the marker sync used to keep', () => {
    it('adopts state/sync/identity so an existing device is not an unknown owner', async () => {
      await root.file(LEGACY_SYNC_OWNER_PATH).writeJSON(OWNER)

      // Without the adoption this would read as "nothing recorded", and the Security page would ask
      // the destructive question once on every existing device for no reason.
      expect(await boot().read(OWNER)).toEqual({ previousOwner: OWNER, current: OWNER, changed: false })
      expect(await marker()).toEqual({ owner: OWNER })
      expect(await root.exists(LEGACY_SYNC_OWNER_PATH)).toBe(false)
    })

    it('carries a disagreement across the move rather than swallowing it', async () => {
      await root.file(LEGACY_SYNC_OWNER_PATH).writeJSON(OWNER)

      expect(await boot().read(MINTED)).toEqual({ previousOwner: OWNER, current: MINTED, changed: true })
    })

    it('ignores the legacy file once protection has a marker of its own', async () => {
      await boot().read(OWNER)
      await root.file(LEGACY_SYNC_OWNER_PATH).writeJSON(STRANGER)

      expect(await boot().read(OWNER)).toEqual({ previousOwner: OWNER, current: OWNER, changed: false })
    })
  })

  describe('a deliberate identity replacement', () => {
    it('reports the handover once, then settles', async () => {
      await boot().read(OWNER)

      await boot().claim(STRANGER)
      expect(await marker()).toEqual({ owner: STRANGER, displaced: OWNER })

      // The boot after the reload: sync must still learn that the state it holds belongs to someone
      // else, even though the marker already names the new owner.
      expect(await boot().read(STRANGER)).toEqual({ previousOwner: OWNER, current: STRANGER, changed: true })
      expect(await marker()).toEqual({ owner: STRANGER })

      // …and only once — the handover is spent.
      expect(await boot().read(STRANGER)).toEqual({ previousOwner: STRANGER, current: STRANGER, changed: false })
    })

    it('displaces nothing when the phrase entered is the one the data already belongs to', async () => {
      await boot().read(OWNER)
      await boot().read(MINTED)

      await boot().claim(OWNER)

      expect(await marker()).toEqual({ owner: OWNER })
      // Restoring the owner of the files on disk must not look like a change — sync keeps its state.
      expect(await boot().read(OWNER)).toEqual({ previousOwner: OWNER, current: OWNER, changed: false })
    })

    it('records a claim on a device that had no marker at all', async () => {
      await boot().claim(OWNER)

      expect(await marker()).toEqual({ owner: OWNER })
    })
  })

  it('reports an unknown owner rather than failing the boot when the store cannot be reached', async () => {
    const broken = new OwnerRegistry({
      state: () => {
        throw new Error('no vfs bound')
      },
      root: () => root,
      logger: silent,
    })

    // Unknown, not changed: nothing irreversible may be decided on a failed read.
    expect(await broken.read(OWNER)).toEqual({ previousOwner: null, current: OWNER, changed: false })
  })
})
