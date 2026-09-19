import { validation } from '@arxhub/errors'

const QUANTITY = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/

export function validateQuantity(quantity: string): string {
  const match = QUANTITY.exec(quantity)
  if (!match) throw validation('Quantity must be a decimal string with at most 6 fractional digits')
  if (BigInt(match[1]) === 0n && !/[1-9]/.test(match[2] ?? '')) throw validation('Quantity must be greater than zero')
  return quantity
}

export function calculateItemTotal(unitPrice: number, quantity: string): number {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw validation('Unit price must be a non-negative safe integer')
  validateQuantity(quantity)
  const [whole, fraction = ''] = quantity.split('.')
  const scale = 10n ** BigInt(fraction.length)
  const units = BigInt(whole) * scale + BigInt(fraction || '0')
  const product = BigInt(unitPrice) * units
  const rounded = product / scale + ((product % scale) * 2n >= scale ? 1n : 0n)
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw validation('Item total exceeds the safe integer range', 'Money overflow')
  return Number(rounded)
}
