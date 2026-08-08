import { describe, expect, test, vi } from 'vitest'
import { createDebouncedTask } from '../scheduling/debounced-task'

describe('debounced task', () => {
  test('several schedule() calls in a row run the task once, after the debounce settles', async () => {
    const run = vi.fn(() => {})
    const task = createDebouncedTask({ run, debounceMs: 20 })

    task.schedule()
    task.schedule()
    task.schedule()
    expect(run).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
  })

  test('a schedule() call resets the delay — the run only fires after the LAST call settles', async () => {
    const run = vi.fn(() => {})
    const task = createDebouncedTask({ run, debounceMs: 30 })

    task.schedule()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(run).not.toHaveBeenCalled()
    task.schedule()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(run).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
  })

  test('cancel() drops a pending run before it fires', async () => {
    const run = vi.fn(() => {})
    const task = createDebouncedTask({ run, debounceMs: 10 })

    task.schedule()
    task.cancel()
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(run).not.toHaveBeenCalled()
  })

  test('flush() skips the delay and runs immediately', async () => {
    const run = vi.fn(() => {})
    const task = createDebouncedTask({ run, debounceMs: 10_000 })

    task.schedule()
    await task.flush()

    expect(run).toHaveBeenCalledTimes(1)
  })

  test('flush() while a run is already in flight joins it instead of starting a second one', async () => {
    let resolveRun: () => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve
        }),
    )
    const task = createDebouncedTask({ run, debounceMs: 10 })

    task.schedule()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const flushed = task.flush()
    resolveRun()
    await flushed

    expect(run).toHaveBeenCalledTimes(1)
  })

  test('flush() propagates a rejection from the run to its caller', async () => {
    const task = createDebouncedTask({
      run: () => Promise.reject(new Error('write failed')),
      debounceMs: 10,
    })

    await expect(task.flush()).rejects.toThrow('write failed')
  })

  test('a rejection from a schedule()-triggered run does not surface as an unhandled rejection', async () => {
    const run = vi.fn(() => Promise.reject(new Error('write failed')))
    const task = createDebouncedTask({ run, debounceMs: 10 })

    task.schedule()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    // Nothing throws here — the rejection was already caught internally by the scheduler, per the
    // contract that only flush() (an explicit, awaited call) propagates a failure to its caller.
  })
})
