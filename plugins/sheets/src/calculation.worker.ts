import { FormulaEngine } from './formula'
import type { Patch, Sheet } from './model'
import type { Workbook } from './workbook'

export interface CalculationRequest {
  id: number
  sheet?: Sheet
  book?: Workbook
  active?: string
  patch: Patch
  rows: number
  columns: number
  keys: string[]
}
let engine: FormulaEngine | null = null
self.onmessage = (event: MessageEvent<CalculationRequest>) => {
  const request = event.data
  try {
    if (request.sheet) engine = new FormulaEngine(request.sheet, request.book)
    engine?.update(request.patch, request.rows, request.columns, request.active)
    self.postMessage({ id: request.id, values: engine?.values(request.keys, request.active) ?? {} })
  } catch {
    self.postMessage({ id: request.id, error: 'Calculation failed. Your cell contents are still available to save.' })
  }
}
