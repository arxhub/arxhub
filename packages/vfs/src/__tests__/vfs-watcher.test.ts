import { describe, expect, test } from 'vitest'
import { type VfsChange, VfsWatcher } from '../vfs-watcher'

const written = (pathname: string): VfsChange => ({ kind: 'written', pathname })

describe('VfsWatcher', () => {
  test('notifies every subscriber', () => {
    const watcher = new VfsWatcher()
    const first: VfsChange[] = []
    const second: VfsChange[] = []
    watcher.subscribe((change) => first.push(change))
    watcher.subscribe((change) => second.push(change))

    watcher.notify(written('notes/a.md'))

    expect(first).toEqual([written('notes/a.md')])
    expect(second).toEqual([written('notes/a.md')])
  })

  test('subscribe returns an unsubscribe that stops the delivery', () => {
    const watcher = new VfsWatcher()
    const seen: VfsChange[] = []
    const unsubscribe = watcher.subscribe((change) => seen.push(change))

    watcher.notify(written('notes/a.md'))
    unsubscribe()
    watcher.notify(written('notes/b.md'))

    expect(seen).toEqual([written('notes/a.md')])
  })

  test('a listener that unsubscribes while being notified does not disturb the others', () => {
    const watcher = new VfsWatcher()
    const seen: string[] = []
    const unsubscribe = watcher.subscribe(() => {
      seen.push('first')
      unsubscribe()
    })
    watcher.subscribe(() => seen.push('second'))

    watcher.notify(written('notes/a.md'))
    watcher.notify(written('notes/b.md'))

    expect(seen).toEqual(['first', 'second', 'second'])
  })

  test('a listener that throws is reported and does not stop the rest', () => {
    const failures: unknown[] = []
    const watcher = new VfsWatcher({ onError: (error) => failures.push(error) })
    const seen: VfsChange[] = []
    watcher.subscribe(() => {
      throw new Error('listener is broken')
    })
    watcher.subscribe((change) => seen.push(change))

    expect(() => watcher.notify(written('notes/a.md'))).not.toThrow()

    expect(failures).toHaveLength(1)
    expect(seen).toEqual([written('notes/a.md')])
  })
})
