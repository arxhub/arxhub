import type { SqlReadOnlyFailure, SqlReadOnlyResult, SqlReadOnlySuccess, SqlRow } from '@arxhub/sql'
import { type Ref, ref, shallowRef } from 'vue'

export interface SqlConsoleController {
  readonly running: Ref<boolean>
  // The last successful result, or null when the last run was refused. Exactly one of these two is set
  // once something has run: a refusal and an empty table are different answers and must not share a slot.
  readonly result: Ref<SqlReadOnlySuccess | null>
  readonly failure: Ref<SqlReadOnlyFailure | null>
  // Whether anything has run at all — what tells "no rows" apart from "no query yet".
  readonly answered: Ref<boolean>
  run(sql: string): Promise<void>
}

export interface SqlConsoleControllerOptions {
  readOnly(sql: string): Promise<SqlReadOnlyResult<SqlRow>>
}

// The console's whole behaviour minus the DOM: one query at a time, a refusal shown as an answer rather
// than raised as a failure, and the previous result cleared the moment a new run starts — a table left
// under a fresh rejection reads as the rejection's own output.
export function createSqlConsoleController({ readOnly }: SqlConsoleControllerOptions): SqlConsoleController {
  const running = ref(false)
  // shallowRef: a result is up to `maxRows` rows of data to display, and deep-proxying every cell would
  // cost more than the query did. It is replaced whole on every run, so shallow reactivity is enough.
  const result = shallowRef<SqlReadOnlySuccess | null>(null)
  const failure = shallowRef<SqlReadOnlyFailure | null>(null)
  const answered = ref(false)

  async function run(sql: string): Promise<void> {
    // A second query over the first is not queued, it is refused: the control that starts one is inert
    // while one runs, and a keyboard shortcut must obey the same rule the button does.
    if (running.value) return
    running.value = true
    result.value = null
    failure.value = null
    try {
      const answer = await readOnly(sql)
      if (answer.ok) result.value = answer
      else failure.value = answer
    } catch (error) {
      // The user path answers with a value, so reaching here means something outside the query broke — a
      // closed index, a driver fault. It is still the console's answer, not a crash of the app around it.
      failure.value = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        code: null,
        position: null,
        durationMs: 0,
      }
    } finally {
      answered.value = true
      running.value = false
    }
  }

  return { running, result, failure, answered, run }
}

// How one cell is drawn. `nullish` is what keeps SQL NULL apart from an empty string: both would otherwise
// be nothing at all on the page, and a query cannot be debugged when they look the same (FE 3.2).
export interface SqlCell {
  text: string
  nullish: boolean
  // An empty string — drawn as a mark rather than as nothing, for the same reason.
  blank: boolean
}

export function formatCell(value: unknown): SqlCell {
  if (value === null || value === undefined) return { text: 'null', nullish: true, blank: false }
  if (value === '') return { text: '(empty)', nullish: false, blank: true }
  if (typeof value === 'string') return { text: value, nullish: false, blank: false }
  if (value instanceof Date) return { text: value.toISOString(), nullish: false, blank: false }
  if (typeof value === 'object') return { text: stringify(value), nullish: false, blank: false }
  return { text: String(value), nullish: false, blank: false }
}

// A jsonb column comes back as a real object, and a table cell has to show it as the text it is (FE 3.3).
// A value JSON cannot express (a cycle, a BigInt) still has to appear rather than take the page down.
function stringify(value: object): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
