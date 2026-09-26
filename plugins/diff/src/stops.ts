import type { DiffCounts, DiffModel, DiffSheetTab, DiffStop } from './model'

const NONE: readonly DiffStop[] = []

// A workbook navigates one sheet at a time, so its stops and its summary are the current tab's; every other
// model has one list for the whole file.
export function stopsOf(model: DiffModel, tabId?: string | null): readonly DiffStop[] {
  if (model.format !== 'sheets') return model.stops
  return tabOf(model.tabs, tabId ?? model.initialTab)?.stops ?? NONE
}

export function countsOf(model: DiffModel, tabId?: string | null): DiffCounts {
  if (model.format !== 'sheets') return model.counts
  return tabOf(model.tabs, tabId ?? model.initialTab)?.counts ?? { added: 0, removed: 0, changed: 0 }
}

function tabOf(tabs: readonly DiffSheetTab[], id: string): DiffSheetTab | undefined {
  return tabs.find((tab) => tab.id === id)
}

// Russian picks the noun form by the last two digits: 1 правка, 2 правки, 5 правок, 11 правок, 21 правка.
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n))
  const tens = abs % 100
  const units = abs % 10
  if (tens >= 11 && tens <= 14) return many
  if (units === 1) return one
  if (units >= 2 && units <= 4) return few
  return many
}
