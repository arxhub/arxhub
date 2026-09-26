import { describe, expect, test } from 'vitest'
import { shallowRef } from 'vue'
import type { DiffResult, DiffSheetModel, DiffSheetTab, DiffTextModel } from '../model'
import { textDiff } from '../text-differ'
import { useDiffController } from '../ui/controller'

function textResult(left: string, right: string, source: DiffTextModel | null = null): DiffResult {
  return { pathname: 'a.md', leftLabel: 'old', rightLabel: 'new', differ: 'text', model: textDiff(left, right), source: () => source }
}

function tab(id: string, changed: number): DiffSheetTab {
  const stops = Array.from({ length: changed }, (_, index) => ({ index, target: `${id}!A${index + 1}`, change: 'changed' as const, tabId: id }))
  return {
    id,
    name: id,
    status: changed > 0 ? 'changed' : 'equal',
    filled: { before: changed, after: changed },
    grid: { rows: changed, columns: 1, cells: {}, changedRows: [] },
    groups: [],
    stops,
    counts: { added: 0, removed: 0, changed },
  }
}

function sheetResult(): DiffResult {
  const model: DiffSheetModel = {
    format: 'sheets',
    tabs: [tab('one', 1), tab('two', 3)],
    initialTab: 'two',
    counts: { added: 0, removed: 0, changed: 4 },
    identical: false,
  }
  return { pathname: 'b.arxs', leftLabel: 'old', rightLabel: 'new', differ: 'sheets', model, source: () => textDiff('x', 'y') }
}

// Three separate changes, so three stops: lines 2, 5 and 8 are edited.
const LEFT = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n')
const RIGHT = ['a', 'B', 'c', 'd', 'E', 'f', 'g', 'H'].join('\n')

describe('useDiffController', () => {
  test('stepping starts from nothing chosen and wraps both ways', () => {
    const controller = useDiffController(textResult(LEFT, RIGHT))
    expect(controller.stops.value).toHaveLength(3)
    expect(controller.current.value).toBe(-1)
    expect(controller.currentStop.value).toBeNull()

    controller.step(1)
    expect(controller.current.value).toBe(0)
    controller.step(1)
    controller.step(1)
    expect(controller.current.value).toBe(2)
    controller.step(1)
    expect(controller.current.value).toBe(0)
    controller.step(-1)
    expect(controller.current.value).toBe(2)
  })

  test('stepping back from nothing chosen lands on the last change', () => {
    const controller = useDiffController(textResult(LEFT, RIGHT))
    controller.step(-1)
    expect(controller.current.value).toBe(2)
    expect(controller.currentStop.value?.target).toBe(controller.stops.value[2].target)
  })

  test('every step asks the view to reveal its stop, even the same one again', () => {
    const controller = useDiffController(textResult('a', 'b'))
    controller.step(1)
    const first = controller.reveal.value
    controller.step(1)
    const second = controller.reveal.value
    expect(first?.target).toBe(controller.stops.value[0].target)
    expect(second?.target).toBe(first?.target)
    expect(second?.seq).toBeGreaterThan(first?.seq ?? 0)
  })

  test('nothing to step through stays at nothing chosen', () => {
    const controller = useDiffController(textResult('same', 'same'))
    controller.step(1)
    expect(controller.current.value).toBe(-1)
    expect(controller.reveal.value).toBeNull()
  })

  test('goTo ignores an index outside the stops', () => {
    const controller = useDiffController(textResult(LEFT, RIGHT))
    controller.goTo(1)
    expect(controller.current.value).toBe(1)
    controller.goTo(7)
    expect(controller.current.value).toBe(1)
  })

  test('a new result resets position, folds, the source toggle and the tab', () => {
    const source = shallowRef<DiffResult | null>(textResult(LEFT, RIGHT, textDiff('x', 'y')))
    const controller = useDiffController(source)
    controller.step(1)
    controller.expand('lines:3')
    controller.showSource.value = true
    controller.step(1)

    source.value = sheetResult()
    expect(controller.current.value).toBe(-1)
    expect(controller.expanded.value.size).toBe(0)
    expect(controller.showSource.value).toBe(false)
    expect(controller.reveal.value).toBeNull()
    expect(controller.tabId.value).toBe('two')

    source.value = textResult('a', 'b')
    expect(controller.tabId.value).toBeNull()
  })

  test('the stops and the summary follow the current sheet, and switching sheet resets the position', () => {
    const controller = useDiffController(sheetResult())
    expect(controller.stops.value).toHaveLength(3)
    expect(controller.counts.value.changed).toBe(3)
    controller.step(-1)
    expect(controller.current.value).toBe(2)

    controller.tabId.value = 'one'
    expect(controller.current.value).toBe(-1)
    expect(controller.stops.value).toHaveLength(1)
    expect(controller.counts.value.changed).toBe(1)
  })

  test('showing the source switches the model to the raw text diff and resets the position', () => {
    const raw = textDiff('{"a":1}', '{"a":2}')
    const controller = useDiffController(textResult(LEFT, RIGHT, raw))
    controller.step(1)
    controller.showSource.value = true
    expect(controller.model.value).toBe(raw)
    expect(controller.current.value).toBe(-1)
    expect(controller.stops.value).toBe(raw.stops)
    controller.showSource.value = false
    expect(controller.model.value?.format).toBe('text')
    expect(controller.stops.value).toHaveLength(3)
  })

  test('a result with no source keeps its own model when the source is asked for', () => {
    const result = textResult('a', 'b')
    const controller = useDiffController(result)
    controller.showSource.value = true
    expect(controller.model.value).toBe(result.model)
  })

  test('expanding a fold twice keeps one entry and a new set only when it changes', () => {
    const controller = useDiffController(textResult('a', 'b'))
    controller.expand('blocks:4')
    const once = controller.expanded.value
    controller.expand('blocks:4')
    expect(controller.expanded.value).toBe(once)
    expect([...once]).toEqual(['blocks:4'])
  })

  test('no result means no model, no stops and zero counts', () => {
    const controller = useDiffController(null)
    expect(controller.model.value).toBeNull()
    expect(controller.stops.value).toHaveLength(0)
    expect(controller.counts.value).toEqual({ added: 0, removed: 0, changed: 0 })
  })
})
