import { validation } from '@arxhub/errors'

const CURRENCY = /^[A-Z]{3}$/
const DECIMAL = /^([+-]?)(\d+)(?:[.,](\d+))?$/

function validMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw validation('Money must be an integer number of minor currency units')
}

export function currencyDigits(currency: string): number {
  if (!CURRENCY.test(currency)) throw validation(`Invalid currency "${currency}": use a three-letter uppercase currency code`)
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
  if (!match) throw validation(`Invalid amount "${input}"`)

  const fraction = match[3] ?? ''
  if (fraction.length > digits) throw validation(`${currency} amounts can have at most ${digits} fractional digit${digits === 1 ? '' : 's'}`)

  const magnitude = BigInt(match[2]) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
  const signed = match[1] === '-' ? -magnitude : magnitude
  if (signed < BigInt(Number.MIN_SAFE_INTEGER) || signed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw validation('Money amount exceeds the safe integer range', 'Money overflow')
  }
  return Number(signed)
}

export function formatAmount(minor: number, currency: string): string {
  validMinor(minor)
  const digits = currencyDigits(currency)
  const scale = 10n ** BigInt(digits)
  const signed = BigInt(minor)
  const magnitude = signed < 0n ? -signed : signed
  const whole = magnitude / scale
  const remainder = magnitude % scale
  const formatter = new Intl.NumberFormat(undefined, {
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
