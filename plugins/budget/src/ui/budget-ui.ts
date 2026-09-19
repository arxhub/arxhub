import type { BudgetData } from '../model'
import { currencyDigits } from '../money'

export type BudgetSection = 'overview' | 'transactions' | 'accounts' | 'categories' | 'places'

export function localDate(now = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localMonth(now = new Date()): string {
  return localDate(now).slice(0, 7)
}

export function moveMonth(month: string, delta: number): string {
  if (!isValidMonth(month)) return month
  const [year, index] = month.split('-').map(Number)
  const absolute = year * 12 + index - 1 + delta
  const movedYear = Math.floor(absolute / 12)
  if (movedYear < 1 || movedYear > 9999) return month
  const movedMonth = (absolute % 12) + 1
  return `${String(movedYear).padStart(4, '0')}-${String(movedMonth).padStart(2, '0')}`
}

export function canMoveMonth(month: string, delta: number): boolean {
  return moveMonth(month, delta) !== month
}

export function isValidMonth(month: string): boolean {
  return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

export function amountInput(minor: number, currency: string): string {
  const digits = currencyDigits(currency)
  const scale = 10n ** BigInt(digits)
  const signed = BigInt(minor)
  const magnitude = signed < 0n ? -signed : signed
  const whole = magnitude / scale
  if (digits === 0) return `${signed < 0n ? '-' : ''}${whole}`
  const fraction = (magnitude % scale).toString().padStart(digits, '0')
  return `${signed < 0n ? '-' : ''}${whole}.${fraction}`
}

export function accountCurrency(data: BudgetData, accountId: string): string {
  return data.accounts.find((account) => account.id === accountId)?.currency ?? 'RUB'
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
