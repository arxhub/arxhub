import { describe, expect, test } from 'vitest'
import type { DiffModel } from '../model'
import { replacedModel, textDiff } from '../text-differ'

const consistent = (model: Extract<DiffModel, { counts: unknown; stops: unknown }>) =>
  model.counts.added + model.counts.removed + model.counts.changed === model.stops.length

describe('textDiff', () => {
  test('pairs an edited line: one changed stop on the removed line, word marks on both', () => {
    const model = textDiff('a\nold line\nc', 'a\nnew line\nc')
    expect(model.lines.map((it) => [it.id, it.change, it.oldNumber, it.newNumber])).toEqual([
      ['l0', 'equal', 1, 1],
      ['l1', 'removed', 2, undefined],
      ['l2', 'added', undefined, 2],
      ['l3', 'equal', 3, 3],
    ])
    expect(model.lines[1]).toMatchObject({ pair: 'l2', stop: 0 })
    expect(model.lines[2]).toMatchObject({ pair: 'l1' })
    expect(model.lines[2].stop).toBeUndefined()
    expect(model.lines[1].segments).toEqual([
      { kind: 'removed', text: 'old' },
      { kind: 'equal', text: ' line' },
    ])
    expect(model.lines[2].segments).toEqual([
      { kind: 'added', text: 'new' },
      { kind: 'equal', text: ' line' },
    ])
    expect(model.stops).toEqual([{ index: 0, target: 'l1', change: 'changed' }])
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    expect(consistent(model)).toBe(true)
  })

  test('the longer side of a run leaves unpaired lines with their own stops and plain text', () => {
    const model = textDiff('x\nr1\nr2\nr3\ny', 'x\na1\ny')
    const changes = model.lines.filter((it) => it.change !== 'equal')
    expect(changes.map((it) => [it.change, it.pair ?? null, it.stop ?? null])).toEqual([
      ['removed', changes[3].id, 0],
      ['removed', null, 1],
      ['removed', null, 2],
      ['added', changes[0].id, null],
    ])
    expect(changes[1].segments).toEqual([{ kind: 'equal', text: 'r2' }])
    expect(model.counts).toEqual({ added: 0, removed: 2, changed: 1 })
    expect(consistent(model)).toBe(true)
  })

  test('pure additions and removals number their lines on their own side only', () => {
    const model = textDiff('a\nb', 'a\nnew\nb\nend')
    expect(model.lines.filter((it) => it.change === 'added').map((it) => it.newNumber)).toEqual([2, 4])
    expect(model.counts).toEqual({ added: 2, removed: 0, changed: 0 })
    expect(consistent(model)).toBe(true)
  })

  test('a changed line ending is a change, named in words and drawn without the \\r', () => {
    const model = textDiff('a\r\nb', 'a\nb')
    expect(model.identical).toBe(false)
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    const added = model.lines.find((line) => line.change === 'added')
    expect(added?.note).toBe('line ending: CRLF → LF')
    expect(model.lines.every((line) => line.segments.every((segment) => !segment.text.includes('\r')))).toBe(true)
    expect(consistent(model)).toBe(true)
  })

  test('the same CRLF text on both sides is identical', () => {
    expect(textDiff('a\r\nb\r\n', 'a\r\nb\r\n').identical).toBe(true)
  })

  test('identical text is identical', () => {
    expect(textDiff('same\ntext', 'same\ntext')).toMatchObject({ identical: true, counts: { added: 0, removed: 0, changed: 0 } })
  })

  test('counts always match stops on a messy edit', () => {
    const left = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n')
    const right = Array.from({ length: 70 }, (_, i) => (i % 7 === 0 ? `edited ${i}` : `line ${i}`)).join('\n')
    expect(consistent(textDiff(left, right))).toBe(true)
  })
})

describe('replacedModel', () => {
  test('one changed stop and a text preview capped at 240 characters', () => {
    const model = replacedModel(new TextEncoder().encode('x'.repeat(300)), new Uint8Array([0, 1, 2]))
    expect(model.left.preview).toHaveLength(240)
    expect(model.right.preview).toBe('[binary, 3 bytes]')
    expect(model.stops).toEqual([{ index: 0, target: 'replaced', change: 'changed' }])
    expect(consistent(model)).toBe(true)
  })

  test('equal bytes are identical and have no stop', () => {
    const model = replacedModel(new Uint8Array([0, 1]), new Uint8Array([0, 1]))
    expect(model).toMatchObject({ identical: true, stops: [], counts: { changed: 0 } })
  })
})
