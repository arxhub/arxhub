export interface DebouncedTaskOptions {
  // The work to run. A failure is the caller's to report (log, toast, …) — this scheduler only decides
  // *when* `run` is called, never whether a rejection was acceptable.
  run(): Promise<void> | void
  debounceMs: number
}

export interface DebouncedTask {
  // (Re)starts the delay. Fires `debounceMs` after the last call with no further call in between —
  // five calls in a row run the task once, not five times.
  schedule(): void
  // Cancels a pending delay without running. A run already in flight is unaffected.
  cancel(): void
  // Runs now, skipping any pending delay. Joins an in-flight run instead of starting a second one
  // over the same resource, and rejects with whatever that run rejected with — flush is the one path
  // a caller (a Save button, a keyboard shortcut) is explicitly waiting on, so a failure has to keep
  // propagating here rather than being lost the way a `schedule`-triggered run's failure is (below).
  flush(): Promise<void>
}

export function createDebouncedTask(options: DebouncedTaskOptions): DebouncedTask {
  return new Debouncer(options)
}

class Debouncer implements DebouncedTask {
  private readonly options: DebouncedTaskOptions
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null

  constructor(options: DebouncedTaskOptions) {
    this.options = options
  }

  schedule(): void {
    this.cancel()
    this.timer = setTimeout(() => {
      this.timer = null
      // Nobody is waiting on a timer-triggered run, so its rejection must not become an unhandled
      // one — `run` already had its chance to report the failure itself.
      void this.runNow().catch(() => {})
    }, this.options.debounceMs)
  }

  cancel(): void {
    if (this.timer == null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  flush(): Promise<void> {
    this.cancel()
    return this.runNow()
  }

  private runNow(): Promise<void> {
    if (this.running != null) return this.running
    const running = Promise.resolve(this.options.run()).finally(() => {
      this.running = null
    })
    this.running = running
    return running
  }
}
