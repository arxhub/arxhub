import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
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
