import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import type { VirtualEntry, VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { ExplorerExtension } from '../explorer-extension'

function listingVfs(entries: Record<string, VirtualEntry[]>): VirtualFileSystem & { listed: string[] } {
  const fail = (): never => {
    throw illegalState('vfs should not be called by this test')
  }
  const listed: string[] = []
  return {
    listed,
    list: async (pathname: string) => {
      listed.push(pathname)
      return entries[pathname] ?? []
    },
    file: fail,
    dir: fail,
    walk: fail,
    read: fail,
    readable: fail,
    write: fail,
    writable: fail,
    delete: fail,
    exists: fail,
    head: fail,
    lock: fail,
    acquireLock: fail,
  } as unknown as VirtualFileSystem & { listed: string[] }
}

const VAULT: Record<string, VirtualEntry[]> = {
  '': [
    { kind: 'dir', pathname: 'work' },
    { kind: 'file', pathname: 'todo.arx' },
  ],
  work: [
    { kind: 'dir', pathname: 'work/2026' },
    { kind: 'file', pathname: 'work/plan.arx' },
  ],
  'work/2026': [{ kind: 'file', pathname: 'work/2026/budget.arxs' }],
}

async function loaded(): Promise<{ explorer: ExplorerExtension; vfs: ReturnType<typeof listingVfs> }> {
  const vfs = listingVfs(VAULT)
  const explorer = new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '' })
  await explorer.loadRoot()
  return { explorer, vfs }
}

describe('walking folders for a picker', () => {
  test('lists a folder without opening it in the vault tree', async () => {
    const { explorer } = await loaded()
    const work = explorer.tree.value[0]

    await explorer.load(work)

    expect(work.children?.map((it) => it.entry.pathname)).toEqual(['work/2026', 'work/plan.arx'])
    expect(work.expanded).toBe(false)
    expect(explorer.expandedPaths()).toEqual([])
  })

  test('lists every folder down to the one asked for, from the top, and answers the chain', async () => {
    const { explorer } = await loaded()

    const chain = await explorer.loadFolderChain('work/2026')

    expect(chain).toEqual(['work', 'work/2026'])
    expect(explorer.tree.value[0].children?.[0].children?.map((it) => it.entry.pathname)).toEqual(['work/2026/budget.arxs'])
    expect(explorer.expandedPaths()).toEqual([])
  })

  test('stops at a folder that is gone instead of failing', async () => {
    const { explorer } = await loaded()

    expect(await explorer.loadFolderChain('archive/old')).toEqual([])
  })

  test('the root is no folder to walk into', async () => {
    const { explorer, vfs } = await loaded()
    const before = vfs.listed.length

    expect(await explorer.loadFolderChain('/')).toEqual([])
    expect(vfs.listed.length).toBe(before)
  })
})

describe('revealing a document in the vault tree', () => {
  test('finds folders a backend lists with a leading separator', async () => {
    const vfs = listingVfs({ '/': [{ kind: 'dir', pathname: '/work' }], '/work': [{ kind: 'file', pathname: '/work/plan.arx' }] })
    const explorer = new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '/' })
    await explorer.loadRoot()

    await explorer.reveal('work/plan.arx')

    expect(explorer.expandedPaths()).toEqual(['/work'])
  })

  test('opens every folder above it', async () => {
    const { explorer } = await loaded()

    await explorer.reveal('work/2026/budget.arxs')

    expect(explorer.expandedPaths()).toEqual(['work', 'work/2026'])
  })

  test('leaves the tree as it is for a document at the root', async () => {
    const { explorer } = await loaded()

    await explorer.reveal('todo.arx')

    expect(explorer.expandedPaths()).toEqual([])
  })
})
