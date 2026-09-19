import { describe, expect, test } from 'vitest'
import { calculateItemTotal, validateQuantity } from '../items'

describe('budget item quantities', () => {
  test('multiplies decimal quantities with exact BigInt half-up rounding', () => {
    expect(calculateItemTotal(199, '2.5')).toBe(498)
    expect(calculateItemTotal(1, '0.5')).toBe(1)
    expect(calculateItemTotal(1, '0.499999')).toBe(0)
    expect(calculateItemTotal(12_345, '1')).toBe(12_345)
  })

  test('accepts positive quantities through six fractional digits', () => {
    expect(validateQuantity('1')).toBe('1')
    expect(validateQuantity('0.000001')).toBe('0.000001')
    expect(validateQuantity('123.456789')).toBe('123.456789')
  })

  test.each(['0', '0.000000', '-1', '1.1234567', '1e2', '1,5', '.5', '01'])('rejects non-canonical or invalid quantity %s', (quantity) => {
    expect(() => validateQuantity(quantity)).toThrow()
  })

  test('rejects invalid prices and an unsafe rounded result', () => {
    expect(() => calculateItemTotal(-1, '1')).toThrow(/non-negative safe integer/)
    expect(() => calculateItemTotal(1.5, '1')).toThrow(/non-negative safe integer/)
    expect(() => calculateItemTotal(Number.MAX_SAFE_INTEGER, '2')).toThrow(/safe integer range/)
  })
})
