import { expect, test } from 'vitest'
import { canInsertReference, insertReference } from '../reference-input'

const a1 = { row: 0, column: 0 },
  b2 = { row: 1, column: 1 },
  c3 = { row: 2, column: 2 }

test('pointing replaces the last picked reference until an operator is typed', () => {
  const first = insertReference('=SUM(', 5, 5, a1)
  expect(first?.text).toBe('=SUM(A1')
  const second = insertReference(first?.text ?? '', 7, 7, b2, b2, first)
  expect(second?.text).toBe('=SUM(B2')
  expect(insertReference('=SUM(B2+', 8, 8, c3, c3, second)?.text).toBe('=SUM(B2+C3')
})

test('dragging in either direction updates one range, retaining surrounding syntax', () => {
  const first = insertReference('=SUM()+5', 5, 5, b2)
  expect(first?.text).toBe('=SUM(B2)+5')
  const range = insertReference(first?.text ?? '', 7, 7, b2, a1, first)
  expect(range?.text).toBe('=SUM(A1:B2)+5')
  expect(insertReference(range?.text ?? '', 10, 10, b2, c3, range)?.text).toBe('=SUM(B2:C3)+5')
})

test('editing existing references and selected text preserves the rest of the formula', () => {
  expect(insertReference('=A1+$B$2', 2, 2, c3)?.text).toBe('=C3+$B$2')
  expect(insertReference('=SUM(A1:B2)+4', 9, 9, c3)?.text).toBe('=SUM(C3)+4')
  expect(insertReference('=SUM(A1)+B2', 5, 7, c3)?.text).toBe('=SUM(C3)+B2')
  expect(insertReference('=A1+4', 0, 5, c3)?.text).toBe('=C3')
  expect(insertReference('=LOG10()', 7, 7, c3)?.text).toBe('=LOG10(C3)')
})

test('quoted text and plain values never enter reference picking', () => {
  expect(canInsertReference('value', 5, 5)).toBe(false)
  expect(insertReference('="A1"', 3, 3, b2)).toBeNull()
  expect(insertReference('="say ""A1"""&', 9, 9, b2)).toBeNull()
  expect(insertReference('="A1"&', 6, 6, b2)?.text).toBe('="A1"&B2')
  expect(insertReference(`=${'1'.repeat(4095)}`, 4096, 4096, b2)).toBeNull()
})

test('picking a local cell replaces the complete qualified reference under the caret', () => {
  expect(insertReference("='Other Sheet'!A1+2", 15, 15, { row: 1, column: 1 })?.text).toBe('=B2+2')
})
