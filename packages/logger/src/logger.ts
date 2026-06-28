import { createKey } from '@arxhub/di'

// Structured log function, shaped to match Pino's level methods: either a plain message (with
// optional interpolation args) or a merge-object followed by an optional message.
export interface LogFn {
  (msg: string, ...args: unknown[]): void
  (obj: object, msg?: string, ...args: unknown[]): void
}

// Structured logger surface. A Pino instance satisfies this structurally; ConsoleLogger implements it
// for tests and for Node construction sites that just need a cheap logger.
export interface Logger {
  debug: LogFn
  info: LogFn
  warn: LogFn
  error: LogFn
  // Returns a child logger carrying the merged structured `bindings` (e.g. `{ name: 'Sync' }`) on
  // every record — replaces the old string-prefix model.
  child(bindings: Record<string, unknown>): Logger
}

// Per-plugin logger DI key. Bound per-plugin by bindPluginLogger to a `{ name }`-bound child of the
// RootLogger. Declared here, next to the interface, so the value (key) and type (interface) merge
// under the single name `Logger` — consumers resolve the scoped logger as `ctx.services.get(Logger)`
// and type against `Logger` from the same import.
export const Logger = createKey<Logger>('Logger')

type Level = 'debug' | 'info' | 'warn' | 'error'

// Minimal structured logger that forwards to the console. Not the application root logger (that is a
// Pino instance, see createRootLogger) — kept for tests and for VFS impls constructed outside the
// plugin lifecycle.
export class ConsoleLogger implements Logger {
  private readonly bindings: Record<string, unknown>

  constructor(bindings: Record<string, unknown> = {}) {
    this.bindings = bindings
  }

  private write(level: Level, message: unknown, optionalParams: unknown[]): void {
    const name = this.bindings.name
    const prefix = typeof name === 'string' ? `[${name}]` : null
    const args = [message, ...optionalParams]
    console[level](...(prefix ? [prefix, ...args] : args))
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams)
  }

  info(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams)
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings })
  }
}
