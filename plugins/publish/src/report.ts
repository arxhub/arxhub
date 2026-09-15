import type { Logger } from '@arxhub/core'
import { toaster } from '@arxhub/uikit/hooks'

// Menu and page invokers do not await an action, so a rejection would otherwise surface as an unhandled
// promise — or, seen from the screen, as a button that did nothing. Logged AND toasted: a failure that only
// reached the log is how a stale server pin went unnoticed for weeks. `context` is a verb phrase
// ('publish notes/a.md') so it reads in both places.
export type ReportFailures = (action: Promise<void>, context: string) => void

export function reportFailures(logger: Logger): ReportFailures {
  return (action, context) => {
    action.catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, `${context} failed`)
      toaster.create({ title: `Could not ${context}`, description: String(error), type: 'error' })
    })
  }
}
