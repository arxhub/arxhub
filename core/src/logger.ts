export interface Logger {
  log(message: unknown, ...optonalParams: unknown[]): void
  warn(message: unknown, ...optonalParams: unknown[]): void
  error(message: unknown, ...optonalParams: unknown[]): void
}

export class ConsoleLogger implements Logger {
  log(message: unknown, ...optonalParams: unknown[]): void {
    console.log(message, ...optonalParams)
  }

  warn(message: unknown, ...optonalParams: unknown[]): void {
    console.warn(message, ...optonalParams)
  }

  error(message: unknown, ...optonalParams: unknown[]): void {
    console.error(message, ...optonalParams)
  }
}
