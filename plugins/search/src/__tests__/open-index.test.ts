import { sqlIndexOpen } from '@arxhub/sql'
import { describe, expect, it, vi } from 'vitest'
import { isRetryableOpenError, openWithRetry } from '../open-index'

const storeFailure = () => sqlIndexOpen('idb://arxhub-sql', new Error('database is locked'))
const noDelay = () => 0

describe('opening the index with a retry', () => {
  it('answers with the index when the first attempt works', async () => {
    const open = vi.fn(async () => 'index')
    await expect(openWithRetry({ open, attempts: 3, delayMs: noDelay })).resolves.toBe('index')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('wins on a later attempt — the case this exists for', async () => {
    // The store lost a race with another context of the same app and is free a moment later.
    const open = vi.fn().mockRejectedValueOnce(storeFailure()).mockRejectedValueOnce(storeFailure()).mockResolvedValue('index')
    const onRetry = vi.fn()

    await expect(openWithRetry({ open, attempts: 3, delayMs: noDelay, onRetry })).resolves.toBe('index')
    expect(open).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last attempt, with the original failure and not one of its own', async () => {
    const failure = storeFailure()
    const open = vi.fn().mockRejectedValue(failure)

    await expect(openWithRetry({ open, attempts: 3, delayMs: noDelay })).rejects.toBe(failure)
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('does not retry a dataDir the engine refuses', async () => {
    // A configuration mistake is refused identically every time; retrying it only delays the report,
    // which is why the plugin's "an index that will not open" case still fails at once.
    const refusal = new Error('A SQL index needs a dataDir')
    const open = vi.fn().mockRejectedValue(refusal)

    await expect(openWithRetry({ open, attempts: 3, delayMs: noDelay })).rejects.toBe(refusal)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('stops trying once the caller has stopped caring', async () => {
    // A plugin torn down mid-open must not keep going, and must not end up holding a handle that
    // nothing is left to close.
    let stopping = false
    const open = vi.fn(async () => {
      stopping = true
      throw storeFailure()
    })

    await expect(openWithRetry({ open, attempts: 5, delayMs: noDelay, cancelled: () => stopping })).rejects.toThrow()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('names the one error worth trying again', () => {
    expect(isRetryableOpenError(storeFailure())).toBe(true)
    expect(isRetryableOpenError(new Error('anything else'))).toBe(false)
  })
})
