import { createKey } from '@arxhub/di'

export interface Logger {
  log(message: unknown, ...optonalParams: unknown[]): void
  info(message: unknown, ...optonalParams: unknown[]): void
  warn(message: unknown, ...optonalParams: unknown[]): void
  error(message: unknown, ...optonalParams: unknown[]): void
  child(prefix: string): Logger
}

// Per-plugin logger DI key. Bound per-plugin by bindPluginLogger to a name-prefixed child of the
// RootLogger. Declared here, next to the interface, so the value (key) and type (interface) merge
// under the single name `Logger` — consumers resolve the scoped logger as `ctx.services.get(Logger)`
// and type against `Logger` from the same import.
export const Logger = createKey<Logger>('Logger')

export class ConsoleLogger implements Logger {
  private prefix: string | null = null

  constructor(prefix: string | null = null) {
    this.prefix = prefix
  }

  private formatMessage(message: unknown): unknown {
    return this.prefix ? `${this.prefix}${message}` : message
  }

  log(message: unknown, ...optonalParams: unknown[]): void {
    console.log(this.formatMessage(message), ...optonalParams)
  }

  info(message: unknown, ...optonalParams: unknown[]): void {
    // console.info is often styled the same as console.log, so using log for consistency
    console.log(this.formatMessage(message), ...optonalParams)
  }

  warn(message: unknown, ...optonalParams: unknown[]): void {
    console.warn(this.formatMessage(message), ...optonalParams)
  }

  error(message: unknown, ...optonalParams: unknown[]): void {
    console.error(this.formatMessage(message), ...optonalParams)
  }

  child(prefix: string): Logger {
    // Combine existing prefix with the new one
    const newPrefix = this.prefix ? `${this.prefix}${prefix}` : prefix
    return new ConsoleLogger(newPrefix)
  }
}
