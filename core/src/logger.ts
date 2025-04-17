export interface Logger {
  log(message: unknown, ...optonalParams: unknown[]): void
  info(message: unknown, ...optonalParams: unknown[]): void
  warn(message: unknown, ...optonalParams: unknown[]): void
  error(message: unknown, ...optonalParams: unknown[]): void
  child(prefix: string): Logger
}

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
