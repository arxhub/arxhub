import type { EntryRecord } from '@arxhub/plugin-protection'
import { describe, expect, test, vi } from 'vitest'
import { adoptEntryServer } from '../entry-server'

function handover(entry: EntryRecord | null, serverUrl: string) {
  return { entry, serverUrl, writeServerUrl: vi.fn(async () => {}), completeEntry: vi.fn() }
}

describe('adoptEntryServer', () => {
  test('writes the server a new vault chose into an empty config and completes the record', async () => {
    const it = handover({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' }, '')

    expect(await adoptEntryServer(it)).toBe('https://hub.example.com')
    expect(it.writeServerUrl).toHaveBeenCalledWith('https://hub.example.com')
    expect(it.completeEntry).toHaveBeenCalledTimes(1)
  })

  test('keeps an address already in the config, and still completes the record', async () => {
    const it = handover({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' }, 'https://mine.example.org')

    expect(await adoptEntryServer(it)).toBe('https://mine.example.org')
    expect(it.writeServerUrl).not.toHaveBeenCalled()
    expect(it.completeEntry).toHaveBeenCalledTimes(1)
  })

  test('leaves the record alone when the write fails, so the next start tries again', async () => {
    const it = handover({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' }, '')
    it.writeServerUrl.mockRejectedValueOnce(new Error('offline'))

    await expect(adoptEntryServer(it)).rejects.toThrow('offline')
    expect(it.completeEntry).not.toHaveBeenCalled()
  })

  test.each([null, { v: 1, kind: 'new', step: 'server' } as const])('does nothing without a connect record (%o)', async (entry) => {
    const it = handover(entry, '')

    expect(await adoptEntryServer(it)).toBe('')
    expect(it.writeServerUrl).not.toHaveBeenCalled()
    expect(it.completeEntry).not.toHaveBeenCalled()
  })

  test('runs a join on the address it brought, writing nothing before the first download', async () => {
    const it = handover({ v: 1, kind: 'join', serverUrl: 'https://hub.example.com', since: '2026-09-26T00:00:00.000Z' }, '')

    expect(await adoptEntryServer(it)).toBe('https://hub.example.com')
    expect(it.writeServerUrl).not.toHaveBeenCalled()
    expect(it.completeEntry).not.toHaveBeenCalled()
  })

  test('a join resumed after its config landed runs on the config', async () => {
    const it = handover(
      { v: 1, kind: 'join', serverUrl: 'https://hub.example.com', since: '2026-09-26T00:00:00.000Z' },
      'https://lan.example.org',
    )

    expect(await adoptEntryServer(it)).toBe('https://lan.example.org')
    expect(it.completeEntry).not.toHaveBeenCalled()
  })
})
