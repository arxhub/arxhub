import { ConsoleLogger } from '@arxhub/core'
import { beforeEach, describe, expect, test } from 'vitest'
import { NodeFileSystem } from '../index'

// Backends must not hide dot-prefixed names from list/walk (packages/vfs AGENTS — the .arxmeta exception is gone).
describe('NodeFileSystem dotfiles', () => {
  let vfs: NodeFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/dotfiles`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('lists .keep and other dot-prefixed files', async () => {
    await vfs.write('new-folder/.keep', new Uint8Array())
    await vfs.write('new-folder/.arxmeta', new TextEncoder().encode('{}'))

    const names = (await vfs.list('new-folder')).map((e) => e.pathname).sort()
    expect(names).toEqual(['new-folder/.arxmeta', 'new-folder/.keep'])
  })
})
