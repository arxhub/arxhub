import { validation } from '@arxhub/errors'
import { budgetError } from './errors'

const CURRENCY = /^[A-Z]{3}$/
const DECIMAL = /^([+-]?)(\d+)(?:[.,](\d+))?$/

function validMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw validation('Money must be an integer number of minor currency units')
}

export function currencyDigits(currency: string): number {
  if (!CURRENCY.test(currency)) throw budgetError('BudgetCurrencyInvalid', { currency })
  try {
    const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
    if (digits === undefined) throw new RangeError('Intl did not report currency precision')
    return digits
  } catch {
    throw validation(`Invalid currency "${currency}": Intl cannot format this currency`, 'Invalid currency')
  }
}

export function parseAmount(input: string, currency: string): number {
  const digits = currencyDigits(currency)
  const match = DECIMAL.exec(input.trim())
  if (!match) throw budgetError('BudgetAmountInvalid', { input })

  const fraction = match[3] ?? ''
  if (fraction.length > digits) throw budgetError('BudgetAmountPrecision', { currency, digits })

  const magnitude = BigInt(match[2]) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
  const signed = match[1] === '-' ? -magnitude : magnitude
  if (signed < BigInt(Number.MIN_SAFE_INTEGER) || signed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw validation('Money amount exceeds the safe integer range', 'Money overflow')
  }
  return Number(signed)
}

// `locale` is the interface language's: the UI passes it (see ui/budget-ui.ts). This module also runs on the
// headless server, which has no interface language, so it does not read one itself.
export function formatAmount(minor: number, currency: string, locale?: string): string {
  validMinor(minor)
  const digits = currencyDigits(currency)
  const scale = 10n ** BigInt(digits)
  const signed = BigInt(minor)
  const magnitude = signed < 0n ? -signed : signed
  const whole = magnitude / scale
  const remainder = magnitude % scale
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  if (digits === 0) return formatter.format(signed)

  const value: number | bigint = signed < 0n ? (whole === 0n ? -0 : -whole) : whole
  const fraction = new Intl.NumberFormat(formatter.resolvedOptions().locale, {
    useGrouping: false,
    minimumIntegerDigits: digits,
    maximumFractionDigits: 0,
  }).format(remainder)
  return formatter
    .formatToParts(value)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('')
}
