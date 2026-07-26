import { describe, expect, test, vi } from 'vitest'
import { createIndexQueue } from '../index-queue'
import { FakeIndexer, silentLogger } from './fake-indexer'

function setup(debounceMs = 20) {
  const indexer = new FakeIndexer()
  const logger = silentLogger()
  return { indexer, logger, queue: createIndexQueue({ indexer, logger, debounceMs }) }
}

describe('index queue', () => {
  test('a written change reindexes the path, a deleted change removes it', async () => {
    const { indexer, queue } = setup()

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    queue.push({ kind: 'deleted', pathname: 'notes/b.md' })
    await queue.flush()

    expect(indexer.indexed).toEqual(['notes/a.md'])
    expect(indexer.removed).toEqual(['notes/b.md'])
  })

  test('a renamed change removes the old path and reindexes the new one', async () => {
    const { indexer, queue } = setup()

    queue.push({ kind: 'renamed', pathname: 'notes/b.md', from: 'notes/a.md' })
    await queue.flush()

    expect(indexer.removed).toEqual(['notes/a.md'])
    expect(indexer.indexed).toEqual(['notes/b.md'])
  })

  test('five writes of one path in a row reindex it once', async () => {
    const { indexer, queue } = setup()

    for (let i = 0; i < 5; i++) queue.push({ kind: 'written', pathname: 'notes/a.md' })
    await queue.flush()

    expect(indexer.indexed).toEqual(['notes/a.md'])
  })

  test('the drain waits for the debounce to pass, then runs on its own', async () => {
    const { indexer, queue } = setup(20)

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(indexer.indexed).toEqual([])

    await vi.waitFor(() => expect(indexer.indexed).toEqual(['notes/a.md']))
  })

  test('a change during the debounce window pushes the drain back', async () => {
    const { indexer, queue } = setup(30)

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    queue.push({ kind: 'written', pathname: 'notes/b.md' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(indexer.indexed).toEqual([])

    await vi.waitFor(() => expect(indexer.indexed.sort()).toEqual(['notes/a.md', 'notes/b.md']))
  })

  test('the last change on a path decides which side it lands on', async () => {
    const { indexer, queue } = setup()

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    queue.push({ kind: 'deleted', pathname: 'notes/a.md' })
    queue.push({ kind: 'deleted', pathname: 'notes/b.md' })
    queue.push({ kind: 'written', pathname: 'notes/b.md' })
    await queue.flush()

    expect(indexer.removed).toEqual(['notes/a.md'])
    expect(indexer.indexed).toEqual(['notes/b.md'])
  })

  test('a path that fails does not stop the rest of the queue', async () => {
    const { indexer, logger, queue } = setup()
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    indexer.failOn.add('notes/broken.md')

    queue.push({ kind: 'written', pathname: 'notes/broken.md' })
    queue.push({ kind: 'written', pathname: 'notes/fine.md' })
    await queue.flush()

    expect(indexer.indexed).toEqual(['notes/fine.md'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('a change that arrives mid-drain is handled by the same drain', async () => {
    const { indexer, queue } = setup()
    const original = indexer.indexPath.bind(indexer)
    let pushedOnce = false
    vi.spyOn(indexer, 'indexPath').mockImplementation(async (pathname: string) => {
      await original(pathname)
      if (pushedOnce) return
      pushedOnce = true
      queue.push({ kind: 'written', pathname: 'notes/late.md' })
    })

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    await queue.flush()

    expect(indexer.indexed).toEqual(['notes/a.md', 'notes/late.md'])
  })

  test('dispose drops the pending timer and stops accepting changes', async () => {
    const { indexer, queue } = setup(10)

    queue.push({ kind: 'written', pathname: 'notes/a.md' })
    queue.dispose()
    queue.push({ kind: 'written', pathname: 'notes/b.md' })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(indexer.indexed).toEqual([])
    expect(queue.running).toBeNull()
  })
})
