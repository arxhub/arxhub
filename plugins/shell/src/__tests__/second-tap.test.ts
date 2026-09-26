import { describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import { secondTapOf } from '../ui/second-tap'
import { objectGone, type TabType } from '../ui/tab-type'

const View = { name: 'view' } as Component
const objects = {
  open: () => new Promise<never>(() => {}),
  revive: () => Promise.resolve(objectGone),
  label: () => ({ title: '' }),
}

describe('what a second tap on the active type opens', () => {
  test("the type's own content wins over every default", () => {
    const type: TabType = {
      id: 'budget',
      icon: 'lu:wallet',
      title: 'Budget',
      content: View,
      nav: { component: View },
      sheet: { content: View },
    }
    expect(secondTapOf(type)).toBe('content')
  })

  test('an object type that counts its tabs lists them', () => {
    const type: TabType = { id: 'docs', icon: 'lu:file', title: 'Documents', objects, open: { title: 'Open' }, nav: { component: View } }
    expect(secondTapOf(type)).toBe('tabs')
  })

  test('a type without objects shows its navigation', () => {
    const type: TabType = { id: 'settings', icon: 'lu:settings', title: 'Settings', content: View, nav: { component: View } }
    expect(secondTapOf(type)).toBe('nav')
  })

  test('a type with nothing behind it has no second level, and the tap does nothing', () => {
    const type: TabType = { id: 'logs', icon: 'lu:list', title: 'Logs', content: View }
    expect(secondTapOf(type)).toBeNull()
  })
})
