import type { CellValue } from './formula'
import { displayValue, isCellError } from './formula'

export type NumberKind = 'general' | 'number' | 'percent' | 'currency' | 'date'
export interface CellFormat {
  kind: NumberKind
  decimals: number
  currency: string
}
export const defaultFormat: CellFormat = { kind: 'general', decimals: 2, currency: 'USD' }
const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
export const DATE_EPOCH = Date.UTC(1899, 11, 30)
export function dateSerial(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  const time = Date.parse(`${input}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === input ? (time - DATE_EPOCH) / 86_400_000 : null
}
export function formatValue(value: CellValue, format?: CellFormat): string {
  if (!format || format.kind === 'general' || typeof value !== 'number' || isCellError(value)) return displayValue(value)
  if (format.kind === 'date') {
    const time = DATE_EPOCH + value * 86_400_000
    return Number.isFinite(time) && Math.abs(time) < 8.64e15 ? dateFormat.format(new Date(time)) : '#NUM!'
  }
  const key = `${format.kind}:${format.decimals}:${format.currency}`
  let formatter = numberFormats.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      style: format.kind === 'number' ? 'decimal' : format.kind,
      currency: format.currency,
      minimumFractionDigits: format.decimals,
      maximumFractionDigits: format.decimals,
    })
    if (numberFormats.size >= 128) numberFormats.clear()
    numberFormats.set(key, formatter)
  }
  return formatter.format(value)
}
