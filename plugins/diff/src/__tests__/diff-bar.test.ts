import { describe, expect, test } from 'vitest'
import type { DiffResult, DiffSheetModel, DiffSheetTab } from '../model'
import { textDiff } from '../text-differ'
import { useDiffController } from '../ui/controller'
import { diffBarControls } from '../ui/diff-bar'

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

function textResult(): DiffResult {
  return { pathname: 'a.md', leftLabel: 'old', rightLabel: 'new', differ: 'text', model: textDiff('a\nb', 'a\nB'), source: () => null }
}

describe('diffBarControls', () => {
  test('the steps are the keys and move the same controller the view reads', () => {
    const controller = useDiffController(textResult())
    const controls = diffBarControls(controller)
    expect(controls.actions.map((action) => action.id)).toEqual(['diff.previous', 'diff.next'])
    expect(controls.sub).toBe('1 change')
    controls.actions[1].onSelect()
    expect(controller.current.value).toBe(0)
    expect(diffBarControls(controller).sub).toBe('1 of 1')
  })

  test('a text diff has no sheets and no view options, only what applies to it', () => {
    const opened: string[] = []
    const controls = diffBarControls(useDiffController(textResult()), { openDocument: () => opened.push('doc') })
    expect(controls.sheets).toHaveLength(0)
    expect(controls.menu.map((action) => action.id)).toEqual(['diff.open-document'])
  })

  test('a workbook names its sheet, offers its sheets and its view, and a pick switches the sheet', () => {
    const controller = useDiffController(sheetResult())
    const controls = diffBarControls(controller)
    expect(controls.sub).toBe('two · 3 changes')
    expect(controls.sheets.map((sheet) => sheet.id)).toEqual(['one', 'two'])
    expect(controls.activeSheet).toBe('two')
    expect(controls.menu.map((action) => action.id)).toEqual(['diff.view', 'diff.source'])
    controls.pickSheet('one')
    expect(controller.tabId.value).toBe('one')

    controls.menu[0].onSelect()
    expect(controller.sheetView.value).toBe('grid')
    const grid = diffBarControls(controller)
    expect(grid.menu.map((action) => action.id)).toEqual(['diff.view', 'diff.rows', 'diff.zoom-out', 'diff.zoom-in', 'diff.source'])
    grid.menu.find((action) => action.id === 'diff.zoom-in')?.onSelect()
    expect(controller.zoom.value).toBeGreaterThan(1)
  })
})
