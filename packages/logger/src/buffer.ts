import { createKey } from '@arxhub/di'
import EventEmitter from 'eventemitter3'

// A single structured log entry — exactly the object Pino's browser `write` hook emits: a numeric
// `level` (20 debug, 30 info, 40 warn, 50 error), `time` epoch millis, the `msg`, an optional `name`
// from child bindings, plus any extra structured fields the caller merged in. JSON-serializable, so
// one record stringifies to one NDJSON line.
export type LogRecord = {
  level: number
  time: number
  msg: string
  name?: string
} & Record<string, unknown>

export type LogListener = (record: LogRecord) => void

// In-memory ring buffer of the most recent records. This is the *live window* that drives the
// reactive panel — the full session is persisted to an NDJSON file by the logger plugin. Framework
// free on purpose (no Vue): the UI adapts `subscribe` into a ref, the file writer collects pushed
// records, and tests use it directly.
export class LogBuffer {
  private readonly capacity: number
  private records: LogRecord[] = []
  private readonly emitter = new EventEmitter<{ push: (record: LogRecord) => void }>()

  constructor(capacity = 2000) {
    this.capacity = capacity
  }

  push(record: LogRecord): void {
    this.records.push(record)
    if (this.records.length > this.capacity) {
      this.records = this.records.slice(this.records.length - this.capacity)
    }
    this.emitter.emit('push', record)
  }

  getAll(): readonly LogRecord[] {
    return this.records
  }

  clear(): void {
    this.records = []
  }

  // Returns an unsubscribe function. The new record is passed so the file writer can queue it without
  // diffing; UI listeners that only need a change signal can ignore the argument.
  subscribe(listener: LogListener): () => void {
    this.emitter.on('push', listener)
    return () => {
      this.emitter.off('push', listener)
    }
  }
}

// DI key for the application-wide LogBuffer. Bound by ArxHub into the root service scope (to the same
// instance the root logger feeds) so plugins — the logger plugin's panel + file writer — can resolve
// it via `ctx.services.get(LogBufferKey)`. A distinct key name is needed because the `LogBuffer` class
// already occupies that identifier as both value and type.
export const LogBufferKey = createKey<LogBuffer>('LogBuffer')
