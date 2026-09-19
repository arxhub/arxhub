import fs from 'node:fs/promises'
import type { Logger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NodeFileSystem } from '../index'

function nodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: injected filesystem failure`), { code })
}

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

describe('NodeFileSystem read/list error classification', () => {
  const directory = `${__dirname}/testdata/error-classification`
  let vfs: NodeFileSystem

  beforeEach(async () => {
    vi.restoreAllMocks()
    vfs = new NodeFileSystem(directory, silent)
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('read maps a genuinely missing file to FileNotFound', async () => {
    await expect(vfs.read('missing.jsonl')).rejects.toSatisfy((error) => hasErrorCode(error, 'FileNotFound'))
  })

  test.each(['EACCES', 'EIO'])('read keeps %s distinguishable from a missing file', async (code) => {
    const cause = nodeError(code)
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(cause)

    await expect(vfs.read('budget.jsonl')).rejects.toMatchObject({
      body: { code: 'InternalServerError', statusCode: 500, message: "Could not read 'budget.jsonl'" },
      originalError: cause,
    })
  })

  test('list returns an empty result for a genuinely missing path', async () => {
    await expect(vfs.list('missing')).resolves.toEqual([])
  })

  test('list preserves the existing-file fallback after readdir reports ENOTDIR', async () => {
    await vfs.write('budget.jsonl', new TextEncoder().encode('{}'))
    expect((await vfs.list('budget.jsonl')).map(({ kind, pathname }) => ({ kind, pathname }))).toEqual([
      { kind: 'file', pathname: 'budget.jsonl' },
    ])
  })

  test.each(['EACCES', 'EIO'])('list keeps %s distinguishable from an empty or missing directory', async (code) => {
    const cause = nodeError(code)
    const stat = vi.spyOn(fs, 'stat')
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(cause)

    await expect(vfs.list('storage/budget')).rejects.toMatchObject({
      body: { code: 'InternalServerError', statusCode: 500, message: "Could not list 'storage/budget'" },
      originalError: cause,
    })
    expect(stat).not.toHaveBeenCalled()
  })

  test('an ENOTDIR fallback does not hide an I/O failure from stat', async () => {
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(nodeError('ENOTDIR'))
    const cause = nodeError('EIO')
    vi.spyOn(fs, 'stat').mockRejectedValueOnce(cause)

    await expect(vfs.list('budget.jsonl')).rejects.toMatchObject({
      body: { code: 'InternalServerError', statusCode: 500, message: "Could not inspect 'budget.jsonl' while listing it" },
      originalError: cause,
    })
  })
})
