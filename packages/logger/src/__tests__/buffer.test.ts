import { describe, expect, it, vi } from 'vitest'
import { LogBuffer, type LogRecord } from '../buffer'

function rec(msg: string, level = 30): LogRecord {
  return { level, time: 0, msg }
}

describe('LogBuffer', () => {
  it('retains pushed records in order', () => {
    const buffer = new LogBuffer()
    buffer.push(rec('a'))
    buffer.push(rec('b'))
    expect(buffer.getAll().map((r) => r.msg)).toEqual(['a', 'b'])
  })

  it('evicts oldest records past capacity', () => {
    const buffer = new LogBuffer(2)
    buffer.push(rec('a'))
    buffer.push(rec('b'))
    buffer.push(rec('c'))
    expect(buffer.getAll().map((r) => r.msg)).toEqual(['b', 'c'])
  })

  it('notifies subscribers with the pushed record and stops after unsubscribe', () => {
    const buffer = new LogBuffer()
    const listener = vi.fn()
    const off = buffer.subscribe(listener)
    buffer.push(rec('a'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({ msg: 'a' })
    off()
    buffer.push(rec('b'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears retained records', () => {
    const buffer = new LogBuffer()
    buffer.push(rec('a'))
    buffer.clear()
    expect(buffer.getAll()).toEqual([])
  })
})
