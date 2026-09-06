import { hasErrorCode } from '@arxhub/errors'

// Opening the index can lose a race it will win a moment later. In the browser the store is one
// IndexedDB origin, and several contexts of the same app — a reload landing on top of the previous
// page's teardown, a second window, eight Playwright workers — contend for it; the loser was told
// "search is unavailable this session" and stayed that way until the page was reloaded, because
// nothing ever tried again. It was observed 54 times in a single e2e run.
//
// Only a failure OF THE STORE is worth retrying. A dataDir the engine refuses outright is a
// configuration mistake and will be refused identically every time, so retrying it would do nothing
// but delay the report — which is why the predicate names one error rather than catching everything.
export const isRetryableOpenError = (error: unknown): boolean => hasErrorCode(error, 'SqlIndexOpenError')

export interface OpenRetryOptions<T> {
  open: () => Promise<T>
  // Total attempts including the first. 1 disables retrying.
  attempts: number
  // How long to wait before attempt n (n starts at 1 for the first retry).
  delayMs: (retry: number) => number
  retryable?: (error: unknown) => boolean
  // Called before each wait, so the caller can say so in its own log rather than have this decide.
  onRetry?: (retry: number, error: unknown) => void
  // True once the caller has stopped caring — a plugin torn down mid-open must not keep trying, and
  // must not open a handle nothing is left to close.
  cancelled?: () => boolean
}

export async function openWithRetry<T>(options: OpenRetryOptions<T>): Promise<T> {
  const { open, attempts, delayMs, retryable = isRetryableOpenError, onRetry, cancelled } = options
  let last: unknown

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    if (cancelled?.() === true) throw last ?? new Error('The index open was cancelled')
    try {
      return await open()
    } catch (error) {
      last = error
      // The last attempt and an error that cannot get better both end here, and the caller sees the
      // original failure rather than one this wrapper invented.
      if (attempt >= attempts || !retryable(error)) throw error
      onRetry?.(attempt, error)
      await new Promise((resolve) => setTimeout(resolve, delayMs(attempt)))
    }
  }

  throw last
}
