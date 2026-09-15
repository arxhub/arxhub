import { illegalState } from '@arxhub/errors'
import type { OpenExternallyCapable, VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import type { TreeNode } from '../explorer-extension'
import { offersExternalOpen } from '../ui/use-file-actions'

// offersExternalOpen never reaches into the vfs beyond asking its capability, so a fake that throws on
// every real operation is exactly what proves that.
function fakeVfs(): VirtualFileSystem {
  const fail = (): never => {
    throw illegalState('vfs should not be called by offersExternalOpen')
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

function capableVfs(): VirtualFileSystem & OpenExternallyCapable {
  return Object.assign(fakeVfs(), { openExternally: async () => {}, canOpenExternally: () => true })
}

function fileNode(pathname: string, opts: Partial<TreeNode> = {}): TreeNode {
  return { entry: { kind: 'file', pathname }, children: null, expanded: false, ...opts }
}

function dirNode(pathname: string): TreeNode {
  return { entry: { kind: 'dir', pathname }, children: null, expanded: false }
}

describe('offersExternalOpen', () => {
  test('a file node offers it when the vfs answers canOpenExternally', () => {
    expect(offersExternalOpen(fileNode('a.skp'), capableVfs())).toBe(true)
  })

  test('a file node does not offer it when the vfs has no such capability (a browser)', () => {
    expect(offersExternalOpen(fileNode('a.skp'), fakeVfs())).toBe(false)
  })

  test('a pending node never offers it — nothing on disk to hand over', () => {
    expect(offersExternalOpen(fileNode('a.skp', { pending: true }), capableVfs())).toBe(false)
  })

  test('a directory node never offers it', () => {
    expect(offersExternalOpen(dirNode('folder'), capableVfs())).toBe(false)
  })
})
