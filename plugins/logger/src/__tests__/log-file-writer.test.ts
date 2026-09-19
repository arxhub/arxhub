import { ConsoleLogger, LogBuffer, type LogRecord } from '@arxhub/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogFileWriter } from '../log-file-writer'
import { dec, MemoryFileSystem } from './memory-file-system'

const SESSION_NOW = Date.parse('2026-06-25T12:30:01.123Z')

function record(msg: string, time = SESSION_NOW): LogRecord {
  return { level: 30, time, msg }
}

function linesOf(text: string): LogRecord[] {
  return text
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LogRecord)
}

async function advanceFlush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(750)
}

describe('LogFileWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes records already in the buffer when open() completes', async () => {
    const vfs = new MemoryFileSystem()
    const buffer = new LogBuffer()
    buffer.push(record('boot-one'))
    buffer.push(record('boot-two', SESSION_NOW + 1))

    const writer = new LogFileWriter(vfs, buffer, new ConsoleLogger())
    const path = await writer.open(SESSION_NOW)
    await advanceFlush()
    await writer.dispose()

    const persisted = linesOf(dec(await vfs.read(path)))
    expect(persisted.map((r) => r.msg)).toEqual(['boot-one', 'boot-two'])
  })

  it('persists records pushed after subscribe', async () => {
    const vfs = new MemoryFileSystem()
    const buffer = new LogBuffer()
    const writer = new LogFileWriter(vfs, buffer, new ConsoleLogger())
    const path = await writer.open(SESSION_NOW)

    buffer.push(record('after-subscribe'))
    await advanceFlush()
    await writer.dispose()

    const persisted = linesOf(dec(await vfs.read(path)))
    expect(persisted.map((r) => r.msg)).toEqual(['after-subscribe'])
  })

  it('backfills pre-open buffer and live pushes in one session without duplicating backlog rows', async () => {
    const vfs = new MemoryFileSystem()
    const buffer = new LogBuffer()
    buffer.push(record('backlog'))

    const writer = new LogFileWriter(vfs, buffer, new ConsoleLogger())
    const path = await writer.open(SESSION_NOW)
    buffer.push(record('live'))

    await advanceFlush()
    await writer.dispose()

    const msgs = linesOf(dec(await vfs.read(path))).map((r) => r.msg)
    expect(msgs).toEqual(['backlog', 'live'])
    expect(msgs.filter((m) => m === 'backlog')).toHaveLength(1)
  })

  it('does not double-write a backlog row when open snapshots before subscribe', async () => {
    const vfs = new MemoryFileSystem()
    const buffer = new LogBuffer()
    buffer.push(record('once'))

    const getAllSpy = vi.spyOn(buffer, 'getAll')
    const subscribeSpy = vi.spyOn(buffer, 'subscribe')

    const writer = new LogFileWriter(vfs, buffer, new ConsoleLogger())
    const path = await writer.open(SESSION_NOW)

    const subscribeOrder = subscribeSpy.mock.invocationCallOrder[0]
    expect(subscribeOrder).toBeDefined()
    expect(getAllSpy.mock.invocationCallOrder[0]).toBeLessThan(subscribeOrder as number)

    await advanceFlush()
    await writer.dispose()

    const msgs = linesOf(dec(await vfs.read(path))).map((r) => r.msg)
    expect(msgs).toEqual(['once'])
  })
})
