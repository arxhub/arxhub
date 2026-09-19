import { describe, expect, test } from 'vitest'
import { currencyDigits, formatAmount, parseAmount } from '../money'

describe('budget money', () => {
  test('uses each currency fraction precision without floating-point parsing', () => {
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('KWD')).toBe(3)
    expect(parseAmount('12', 'JPY')).toBe(12)
    expect(parseAmount('-12.30', 'USD')).toBe(-1230)
    expect(parseAmount('-12,30', 'USD')).toBe(-1230)
    expect(parseAmount('+0.007', 'KWD')).toBe(7)
  })

  test('rejects excess precision, float syntax, bad currencies, and unsafe values', () => {
    expect(() => parseAmount('1.001', 'USD')).toThrow(/at most 2/)
    expect(() => parseAmount('1e2', 'USD')).toThrow(/Invalid amount/)
    expect(() => parseAmount('1,000.00', 'USD')).toThrow(/Invalid amount/)
    expect(() => parseAmount('1.000,00', 'USD')).toThrow(/Invalid amount/)
    expect(() => parseAmount('NaN', 'USD')).toThrow(/Invalid amount/)
    expect(() => parseAmount('1', 'usd')).toThrow(/three-letter uppercase/)
    expect(() => parseAmount('90071992547409.92', 'USD')).toThrow(/safe integer/)
  })

  test('formats the full safe integer including exact minor digits', () => {
    expect(formatAmount(1, 'USD').replace(/\D/g, '')).toBe('001')
    expect(formatAmount(-5, 'USD').replace(/\D/g, '')).toBe('005')
    expect(formatAmount(Number.MAX_SAFE_INTEGER, 'USD').replace(/\D/g, '')).toBe(String(Number.MAX_SAFE_INTEGER))
    expect(() => formatAmount(1.5, 'USD')).toThrow(/integer/)
  })
})
