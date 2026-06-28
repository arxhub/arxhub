import pino from 'pino'
import { LogBuffer, type LogRecord } from './buffer'
import type { Logger } from './logger'

// Numeric Pino levels we capture (trace/fatal omitted — unused here).
const LEVELS = { debug: 20, info: 30, warn: 40, error: 50 } as const
type LevelName = keyof typeof LEVELS

const CONSOLE_METHOD: Record<LevelName, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
}

// Fields that are structural (rendered specially by the panel); everything else on a record is an
// extra structured field worth showing inline in the console mirror.
const STRUCTURAL = new Set(['level', 'time', 'msg', 'name'])

function mirror(level: LevelName, record: LogRecord): void {
  const prefix = typeof record.name === 'string' ? `[${record.name}]` : ''
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!STRUCTURAL.has(k)) extras[k] = v
  }
  const args: unknown[] = [prefix, record.msg].filter((a) => a !== '')
  if (Object.keys(extras).length > 0) args.push(extras)
  console[CONSOLE_METHOD[level]](...args)
}

// Builds the application root logger — a Pino instance whose browser `write` hooks feed a shared
// LogBuffer (the live window the panel renders) and mirror to the console (preserving devtools
// output, which the `write` override would otherwise suppress). Each per-level hook stamps the level
// itself, so capture never depends on Pino's emitted `level` field. In real Node (the headless
// server) the `browser` block is ignored and Pino writes NDJSON to stdout — the buffer stays empty
// there, which is fine since that instance has no panel.
export function createRootLogger(): { logger: Logger; buffer: LogBuffer } {
  const buffer = new LogBuffer()

  const write = {} as Record<LevelName, (o: object) => void>
  for (const name of Object.keys(LEVELS) as LevelName[]) {
    write[name] = (o) => {
      const o2 = o as Partial<LogRecord>
      const record: LogRecord = {
        ...o2,
        level: LEVELS[name],
        time: typeof o2.time === 'number' ? o2.time : Date.now(),
        msg: typeof o2.msg === 'string' ? o2.msg : '',
      }
      buffer.push(record)
      mirror(name, record)
    }
  }

  const logger = pino({
    level: 'debug',
    browser: { asObject: true, serialize: true, write },
  })

  return { logger, buffer }
}
