import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import { VfsWatcher, type VirtualEntry, type VirtualFileSystem } from '@arxhub/vfs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

// collapseAll() only ever touches the in-memory tree — never the backing vfs — so a fake that throws
// on any call is what proves that.
function unusedVfs(): VirtualFileSystem {
  const fail = (): never => {
    throw illegalState('vfs should not be called by this test')
  }
  return {
    file: fail,
    dir: fail,
    list: fail,
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
  }
}

function extension(): ExplorerExtension {
  return new ExplorerExtension({ logger: new ConsoleLogger(), vfs: unusedVfs(), root: '/' })
}

function node(pathname: string, opts: Partial<TreeNode> = {}): TreeNode {
  return { entry: { pathname, kind: opts.children ? 'dir' : 'file' }, children: null, expanded: false, ...opts } as TreeNode
}

describe('collapseAll', () => {
  test('folds every expanded node, at every depth', () => {
    const explorer = extension()
    explorer.tree.value = [
      node('a', { expanded: true, children: [node('a/b', { expanded: true, children: [node('a/b/c')] })] }),
      node('d', { expanded: true, children: [node('d/e')] }),
      node('f.md'),
    ]

    explorer.collapseAll()

    const [a, d, f] = explorer.tree.value
    expect(a.expanded).toBe(false)
    expect(a.children?.[0]?.expanded).toBe(false)
    expect(d.expanded).toBe(false)
    expect(f.expanded).toBe(false)
  })

  test('keeps already-fetched children instead of discarding them', () => {
    const explorer = extension()
    explorer.tree.value = [node('a', { expanded: true, children: [node('a/b')] })]

    explorer.collapseAll()

    expect(explorer.tree.value[0]?.children).toHaveLength(1)
  })
})

describe('displayName', () => {
  test('shows the name as it is on disk until the plugin wires a source in configure()', () => {
    const explorer = extension()
    expect(explorer.displayName(node('notes/plan.arx')).text).toBe('plan.arx')
  })

  // OR-03: never a hand-written list and never a copy of the rule — the extension only ever forwards to
  // whatever the plugin wired (NotesExtension.displayName), so a plugin that stops claiming an extension
  // is answered without this holding anything of its own that could go stale.
  test('forwards to whatever source is currently wired, not a snapshot taken at wiring time', () => {
    const explorer = extension()
    explorer.setDisplayNames(() => ({ text: 'stem', hiddenExtension: '.arx', fullName: (edited) => `${edited}.arx` }))
    const name = explorer.displayName(node('notes/plan.arx'))
    expect(name.text).toBe('stem')
    expect(name.fullName('Invoice')).toBe('Invoice.arx')

    explorer.setDisplayNames((path) => ({ text: path, hiddenExtension: '', fullName: (edited) => edited }))
    expect(explorer.displayName(node('notes/plan.arx')).text).toBe('notes/plan.arx')
  })

  // A folder has no extension a viewer could claim, so it never reaches the source — a directory called
  // 'Archive.md' is still called that.
  test('a directory keeps its whole name, whatever the source would answer', () => {
    const explorer = extension()
    explorer.setDisplayNames(() => ({ text: 'hidden', hiddenExtension: '.md', fullName: (edited) => `${edited}.md` }))
    expect(explorer.displayName(node('Archive.md', { children: [] })).text).toBe('Archive.md')
  })
})

// Job 2: the tree used to be refreshed by whoever wrote, which held only while the tree was the one
// writing. What it must NOT do is pay twice for a write it already refreshed for — see `queuedDirs`.
describe('watching the vault', () => {
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

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a write nobody in the tree made refreshes the directory it landed in', async () => {
    const vfs = listingVfs({ '': [{ kind: 'file', pathname: 'plan.arx' }] })
    const explorer = new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '' })
    const watcher = new VfsWatcher()
    explorer.watchVault(watcher)

    watcher.notify({ kind: 'written', pathname: 'plan.arx' })
    await vi.advanceTimersByTimeAsync(500)

    expect(vfs.listed).toEqual([''])
    expect(explorer.tree.value.map((it) => it.entry.pathname)).toEqual(['plan.arx'])
  })

  test('a write the tree already refreshed for is not listed a second time', async () => {
    const vfs = listingVfs({ '': [{ kind: 'file', pathname: 'plan.arx' }] })
    const explorer = new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '' })
    const watcher = new VfsWatcher()
    explorer.watchVault(watcher)

    // The order a tree write really produces: the vfs reports the change, and the action that made it
    // then refreshes its own directory — before the queue's own timer comes round.
    watcher.notify({ kind: 'renamed', pathname: 'plan.arx', from: 'draft.arx' })
    await explorer.refreshDir('')
    expect(vfs.listed).toEqual([''])

    await vi.advanceTimersByTimeAsync(500)
    expect(vfs.listed).toEqual([''])
  })

  test('the handle stops the watch, and drops what is still queued', async () => {
    const vfs = listingVfs({ '': [] })
    const explorer = new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '' })
    const watcher = new VfsWatcher()
    const stop = explorer.watchVault(watcher)

    watcher.notify({ kind: 'written', pathname: 'plan.arx' })
    stop()
    watcher.notify({ kind: 'written', pathname: 'second.arx' })
    await vi.advanceTimersByTimeAsync(500)

    expect(vfs.listed).toEqual([])
  })
})
