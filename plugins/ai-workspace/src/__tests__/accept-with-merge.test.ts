import { describe, expect, test } from 'vitest'
import { acceptBlocked, applyAcceptWithMerge, mergerPathname } from '../accept-with-merge'
import type { ChangeEntry } from '../session-store'

describe('mergerPathname', () => {
  test('prefixes vault/ once', () => {
    expect(mergerPathname('note.md')).toBe('vault/note.md')
    expect(mergerPathname('vault/note.md')).toBe('vault/note.md')
  })
})

describe('applyAcceptWithMerge', () => {
  test('writes theirs when ours still equals base', async () => {
    const writes: Array<[string, string]> = []
    await applyAcceptWithMerge({
      changes: [{ pathname: 'note.md', kind: 'modified' }],
      beforeClose: async () => true,
      readSide: async (_path, side) => {
        if (side === 'base') return 'base\n'
        if (side === 'overlay') return 'agent\n'
        return 'base\n'
      },
      writeVault: async (path, content) => {
        writes.push([path, content])
      },
      deleteVault: async () => {},
      mergeContent: async () => null,
      archive: async () => {},
    })
    expect(writes).toEqual([['note.md', 'agent\n']])
  })

  test('skips when ours already equals theirs', async () => {
    const writes: Array<[string, string]> = []
    let merged = 0
    await applyAcceptWithMerge({
      changes: [{ pathname: 'note.md', kind: 'modified' }],
      beforeClose: async () => true,
      readSide: async (_path, side) => {
        if (side === 'base') return 'base\n'
        return 'same\n'
      },
      writeVault: async (path, content) => {
        writes.push([path, content])
      },
      deleteVault: async () => {},
      mergeContent: async () => {
        merged++
        return null
      },
      archive: async () => {},
    })
    expect(writes).toEqual([])
    expect(merged).toBe(0)
  })

  test('uses merger when all three sides differ', async () => {
    const writes: Array<[string, string]> = []
    await applyAcceptWithMerge({
      changes: [{ pathname: 'note.md', kind: 'modified' }],
      beforeClose: async () => true,
      readSide: async (_path, side) => {
        if (side === 'base') return 'base\n'
        if (side === 'overlay') return 'agent\n'
        return 'human\n'
      },
      writeVault: async (path, content) => {
        writes.push([path, content])
      },
      deleteVault: async () => {},
      mergeContent: async () => new TextEncoder().encode('merged\n'),
      archive: async () => {},
    })
    expect(writes).toEqual([['note.md', 'merged\n']])
  })

  test('throws AiWorkspaceAcceptBlockedError when merger declines', async () => {
    await expect(
      applyAcceptWithMerge({
        changes: [{ pathname: 'note.md', kind: 'modified' }],
        beforeClose: async () => true,
        readSide: async (_path, side) => {
          if (side === 'base') return 'base\n'
          if (side === 'overlay') return 'agent\n'
          return 'human\n'
        },
        writeVault: async () => {},
        deleteVault: async () => {},
        mergeContent: async () => null,
        archive: async () => {},
      }),
    ).rejects.toMatchObject({ body: { code: 'AiWorkspaceAcceptBlockedError', statusCode: 409 } })
  })

  test('skips staging paths', async () => {
    const writes: Array<[string, string]> = []
    const changes: ChangeEntry[] = [
      { pathname: '_ai-workspace/s1/note.md', kind: 'modified' },
      { pathname: 'note.md', kind: 'modified' },
    ]
    await applyAcceptWithMerge({
      changes,
      beforeClose: async () => true,
      readSide: async (path, side) => {
        if (path.startsWith('_ai-workspace')) throw new Error('should not read staging')
        if (side === 'base') return 'base\n'
        if (side === 'overlay') return 'agent\n'
        return 'base\n'
      },
      writeVault: async (path, content) => {
        writes.push([path, content])
      },
      deleteVault: async () => {},
      mergeContent: async () => null,
      archive: async () => {},
    })
    expect(writes).toEqual([['note.md', 'agent\n']])
  })

  test('acceptBlocked helper shapes the error', () => {
    const err = acceptBlocked('x')
    expect(err.body.code).toBe('AiWorkspaceAcceptBlockedError')
    expect(err.body.statusCode).toBe(409)
  })
})
