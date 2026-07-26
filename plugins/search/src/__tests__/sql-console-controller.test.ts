import type { SqlReadOnlyResult, SqlRow } from '@arxhub/sql'
import { describe, expect, it, vi } from 'vitest'
import { createSqlConsoleController, formatCell } from '../ui/sql-console-controller'

function success(rows: SqlRow[], overrides: { truncated?: boolean; durationMs?: number } = {}): SqlReadOnlyResult<SqlRow> {
  return {
    ok: true,
    rows,
    fields: Object.keys(rows[0] ?? {}).map((name) => ({ name, dataTypeId: 25, type: 'text' })),
    rowCount: rows.length,
    truncated: overrides.truncated ?? false,
    durationMs: overrides.durationMs ?? 3,
  }
}

function refused(message: string, position: number | null = null): SqlReadOnlyResult<SqlRow> {
  return { ok: false, message, code: '25006', position, durationMs: 1 }
}

describe('running a query from the console', () => {
  it('puts a result on one channel and nothing on the other', async () => {
    const controller = createSqlConsoleController({ readOnly: async () => success([{ path: 'a.md' }]) })
    await controller.run('SELECT path FROM document')

    expect(controller.result.value?.rowCount).toBe(1)
    expect(controller.failure.value).toBeNull()
    expect(controller.answered.value).toBe(true)
    expect(controller.running.value).toBe(false)
  })

  it('shows a refusal as an answer, with the DBMS message and the position it gave', async () => {
    const controller = createSqlConsoleController({ readOnly: async () => refused('cannot execute DELETE in a read-only transaction', 8) })
    await controller.run('DELETE FROM document')

    expect(controller.failure.value?.message).toContain('read-only transaction')
    expect(controller.failure.value?.position).toBe(8)
    // No table under the message: a stale result would read as the refused query's own output.
    expect(controller.result.value).toBeNull()
  })

  it('answers again after a refusal — a rejected query must not leave the console dead', async () => {
    const answers: SqlReadOnlyResult<SqlRow>[] = [refused('cannot execute DELETE in a read-only transaction'), success([{ path: 'a.md' }])]
    const controller = createSqlConsoleController({ readOnly: async () => answers.shift() as SqlReadOnlyResult<SqlRow> })

    await controller.run('DELETE FROM document')
    expect(controller.failure.value).not.toBeNull()

    await controller.run('SELECT path FROM document')
    expect(controller.result.value?.rowCount).toBe(1)
    expect(controller.failure.value).toBeNull()
  })

  it('refuses a second query over the first rather than queueing it', async () => {
    // Annotated rather than inferred: the assignment happens inside a callback, so an inferred `null`
    // would narrow to `never` at the call below.
    let release: () => void = () => undefined
    const readOnly = vi.fn(async (): Promise<SqlReadOnlyResult<SqlRow>> => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return success([{ path: 'a.md' }])
    })
    const controller = createSqlConsoleController({ readOnly })

    const first = controller.run('SELECT 1')
    expect(controller.running.value).toBe(true)
    await controller.run('SELECT 2')
    expect(readOnly).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(controller.running.value).toBe(false)
  })

  it('turns a thrown failure into the console’s answer — the panel must not go down with it', async () => {
    const controller = createSqlConsoleController({
      readOnly: () => Promise.reject(new Error('the index is closed')),
    })
    await controller.run('SELECT 1')

    expect(controller.failure.value?.message).toBe('the index is closed')
    expect(controller.running.value).toBe(false)
  })

  it('reports a truncated result as a success that says so', async () => {
    const controller = createSqlConsoleController({ readOnly: async () => success([{ path: 'a.md' }], { truncated: true }) })
    await controller.run('SELECT path FROM document')

    expect(controller.result.value?.truncated).toBe(true)
  })

  it('has answered nothing before the first run, which is what tells an empty table from no query', () => {
    const controller = createSqlConsoleController({ readOnly: async () => success([]) })
    expect(controller.answered.value).toBe(false)
    expect(controller.result.value).toBeNull()
    expect(controller.failure.value).toBeNull()
  })
})

describe('drawing one cell', () => {
  it('marks NULL as such, distinguishably from an empty string', () => {
    expect(formatCell(null)).toEqual({ text: 'null', nullish: true, blank: false })
    expect(formatCell(undefined)).toEqual({ text: 'null', nullish: true, blank: false })
    expect(formatCell('')).toEqual({ text: '(empty)', nullish: false, blank: true })
  })

  it('leaves a string as it is, including one that looks like markup', () => {
    expect(formatCell('<b>жираф</b>')).toEqual({ text: '<b>жираф</b>', nullish: false, blank: false })
  })

  it('writes an object out as its text — a jsonb column comes back as one', () => {
    expect(formatCell({ tags: ['a'] }).text).toBe('{"tags":["a"]}')
    expect(formatCell([1, 2]).text).toBe('[1,2]')
  })

  it('shows a value JSON cannot express rather than taking the page down', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatCell(cyclic).text).toContain('[object')
  })

  it('reads a timestamp as an instant, not as a locale', () => {
    expect(formatCell(new Date('2026-07-26T10:00:00.000Z')).text).toBe('2026-07-26T10:00:00.000Z')
  })

  it('keeps a false and a zero visible — neither is nothing', () => {
    expect(formatCell(false)).toEqual({ text: 'false', nullish: false, blank: false })
    expect(formatCell(0)).toEqual({ text: '0', nullish: false, blank: false })
  })
})
