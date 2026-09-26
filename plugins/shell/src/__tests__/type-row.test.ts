import { describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import { fitTypeRow } from '../ui/mobile/type-row'
import type { TabType } from '../ui/tab-type'
import type { TypeRowItem } from '../ui/workspace'

const View = { name: 'view' } as Component

function item(id: string, active = false): TypeRowItem {
  const type: TabType = { id, icon: 'lu:circle', title: id, content: View }
  return { type, active, count: 0 }
}

describe("the phone's type row", () => {
  test('keeps the order and shows the first keys; More counts the rest', () => {
    const row = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id, id === 'a'))
    const fitted = fitTypeRow(row, 4)
    expect(fitted.shown.map((it) => it.type.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(fitted.hidden).toBe(2)
  })

  test('an active type that would be hidden takes the last key', () => {
    const row = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id, id === 'f'))
    const fitted = fitTypeRow(row, 4)
    expect(fitted.shown.map((it) => it.type.id)).toEqual(['a', 'b', 'c', 'f'])
    expect(fitted.hidden).toBe(2)
  })

  test('a short row is shown whole, with nothing behind More', () => {
    const fitted = fitTypeRow([item('a', true), item('b')], 4)
    expect(fitted.shown).toHaveLength(2)
    expect(fitted.hidden).toBe(0)
  })
})
