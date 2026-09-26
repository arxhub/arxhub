import { ConsoleLogger, type Logger } from '@arxhub/logger'
import { describe, expect, test, vi } from 'vitest'
import { DiffExtension } from '../diff-extension'
import type { DifferRegistration } from '../differ'
import type { DiffModel } from '../model'
import { textDiff } from '../text-differ'

function extension(logger: Logger = new ConsoleLogger()): DiffExtension {
  const ext = new DiffExtension({ logger })
  // The same fallback DiffPlugin.create registers, so resolution is tested as the app runs it.
  ext.registerDiffer({
    id: 'text',
    fallback: true,
    matches: () => true,
    diff: (left, right) => (left.text != null && right.text != null ? textDiff(left.text, right.text) : null),
  })
  return ext
}

const blocks: DiffModel = { format: 'blocks', units: [], stops: [], counts: { added: 0, removed: 0, changed: 0 }, identical: true }

function owner(id: string, answer: DiffModel | null = blocks, extra: Partial<DifferRegistration> = {}): DifferRegistration {
  return { id, matches: (path) => path.endsWith('.arx'), diff: () => answer, ...extra }
}

const request = (pathname: string, left: string | Uint8Array = 'a', right: string | Uint8Array = 'b') => ({
  pathname,
  left,
  right,
  leftLabel: 'L',
  rightLabel: 'R',
})

describe('DiffExtension', () => {
  test('an owner answers before the text fallback, even when it registered after it', async () => {
    const ext = extension()
    ext.registerDiffer(owner('arx'))
    const result = await ext.diff(request('notes/a.arx'))
    expect(result.differ).toBe('arx')
    expect(result.model).toBe(blocks)
    expect(result).toMatchObject({ pathname: 'notes/a.arx', leftLabel: 'L', rightLabel: 'R' })
  })

  test('a fallback registered before an owner still runs after it', async () => {
    const ext = new DiffExtension({ logger: new ConsoleLogger() })
    const calls: string[] = []
    ext.registerDiffer({
      id: 'generic',
      fallback: true,
      matches: () => true,
      diff: () => {
        calls.push('generic')
        return null
      },
    })
    ext.registerDiffer(
      owner('arx', null, {
        diff: () => {
          calls.push('arx')
          return null
        },
      }),
    )
    await ext.diff(request('a.arx'))
    expect(calls).toEqual(['arx', 'generic'])
  })

  test('owners run in registration order and the first answer wins', async () => {
    const ext = extension()
    ext.registerDiffer(owner('first', null))
    ext.registerDiffer(owner('second'))
    expect((await ext.diff(request('a.arx'))).differ).toBe('second')
  })

  test('a declining owner falls through to the text differ', async () => {
    const ext = extension()
    ext.registerDiffer(owner('arx', null))
    const result = await ext.diff(request('a.arx', 'one', 'two'))
    expect(result.differ).toBe('text')
    expect(result.model.format).toBe('text')
  })

  test('a throwing differ is logged, naming it, and treated as a decline', async () => {
    const logger = new ConsoleLogger()
    // The extension logs through its own child logger; handing back the parent keeps one spy in view.
    vi.spyOn(logger, 'child').mockReturnValue(logger)
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const ext = extension(logger)
    ext.registerDiffer(
      owner('broken', null, {
        diff: () => {
          throw new TypeError('boom')
        },
      }),
    )
    const result = await ext.diff(request('a.arx'))
    expect(result.differ).toBe('text')
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]?.[0])).toContain('broken')
    expect(String(error.mock.calls[0]?.[0])).toContain('a.arx')
  })

  test('a throwing matcher is a decline too', async () => {
    const logger = new ConsoleLogger()
    vi.spyOn(logger, 'child').mockReturnValue(logger)
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const ext = extension(logger)
    ext.registerDiffer(
      owner('broken', blocks, {
        matches: () => {
          throw new TypeError('boom')
        },
      }),
    )
    expect((await ext.diff(request('a.arx'))).differ).toBe('text')
  })

  test('a duplicate id is refused', () => {
    const ext = extension()
    expect(() => ext.registerDiffer(owner('text'))).toThrow(/already registered/)
  })

  test('unregister removes only its own registration', async () => {
    const ext = extension()
    const stale = ext.registerDiffer(owner('arx'))
    stale()
    const fresh = { ...blocks }
    ext.registerDiffer(owner('arx', fresh))
    stale()
    expect((await ext.diff(request('a.arx'))).model).toBe(fresh)
  })

  test('bytes nobody can read as text come back as the binary summary', async () => {
    const ext = extension()
    const result = await ext.diff(request('photo.png', new Uint8Array([0, 1, 2]), new Uint8Array([0, 1, 3])))
    expect(result.differ).toBe('binary')
    expect(result.model).toMatchObject({ format: 'replaced', counts: { changed: 1 } })
    expect(result.source()).toBeNull()
  })

  test('source() is the raw text diff behind a format answer, memoized', async () => {
    const ext = extension()
    ext.registerDiffer(owner('arx'))
    const result = await ext.diff(request('a.arx', '{"a":1}', '{"a":2}'))
    const source = result.source()
    expect(source?.format).toBe('text')
    expect(result.source()).toBe(source)
  })

  test('source() is null when the answer already is the text one', async () => {
    const ext = extension()
    expect((await ext.diff(request('a.txt', 'x', 'y'))).source()).toBeNull()
  })

  test('ctx.text lets an owner fall back to the text differ itself', async () => {
    const ext = extension()
    ext.registerDiffer({ id: 'arx', matches: () => true, diff: (l, r, ctx) => ctx.text(`${l.text}!`, `${r.text}!`) })
    const result = await ext.diff(request('a.arx', 'x', 'y'))
    expect(result.differ).toBe('arx')
    expect(result.model.format).toBe('text')
  })

  test('focusedView is the attached view whose element holds focus; detaching forgets it', () => {
    const ext = extension()
    const active = {}
    // No DOM in this suite: an element is only asked whether it contains the active element.
    const element = (holds: boolean) => ({ contains: (node: unknown) => holds && node === active }) as unknown as HTMLElement
    vi.stubGlobal('document', { activeElement: active })
    try {
      const other = { element: element(false), step: () => {} }
      const focused = { element: element(true), step: () => {} }
      ext.attachView(other)
      const detach = ext.attachView(focused)
      expect(ext.focusedView()).toBe(focused)
      detach()
      expect(ext.focusedView()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('focusedView is null outside a browser', () => {
    expect(extension().focusedView()).toBeNull()
  })
})
