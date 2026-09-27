import type { Logger } from '@arxhub/core'
import { describeError } from '@arxhub/i18n'
import { toaster } from '@arxhub/uikit/hooks'

// Menu and page invokers do not await an action, so a rejection would otherwise surface as an unhandled
// promise — or, seen from the screen, as a button that did nothing. Logged AND toasted: a failure that only
// reached the log is how a stale server pin went unnoticed for weeks. `context` is an English verb phrase
// ('publish notes/a.md') for the log; `failure` is the same thing in the reader's language, for the toast.
export type ReportFailures = (action: Promise<void>, context: string, failure: string) => void

// What the toast says under its title: the translated text for an error that has a code, the error itself
// for anything else (a network failure has nothing better to say).
export function errorText(error: unknown): string {
  return describeError(error)?.message ?? String(error)
}

export function reportFailures(logger: Logger): ReportFailures {
  return (action, context, failure) => {
    action.catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, `${context} failed`)
      toaster.create({ title: failure, description: errorText(error), type: 'error' })
    })
  }
}
