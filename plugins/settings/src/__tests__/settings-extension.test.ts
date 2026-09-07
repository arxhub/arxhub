import { ConsoleLogger } from '@arxhub/core'
import { Type } from '@sinclair/typebox'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { StagedChange } from '../pending-changes'
import { SettingsExtension } from '../settings-extension'

const Page = defineComponent({ name: 'Page', template: '<div />' })

function extension(): SettingsExtension {
  // Silent: register()'s guards log, and a rejected registration is the expected outcome there.
  const logger = new ConsoleLogger()
  for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(logger, level).mockImplementation(() => {})
  return new SettingsExtension({ logger })
}

function draft(sectionId: string, values: Record<string, unknown>): StagedChange {
  return { sectionId, title: sectionId, values, keys: Object.keys(values), invalid: false, commit: async () => {}, revert: () => {} }
}

describe('settings sections', () => {
  let settings: SettingsExtension

  beforeEach(() => {
    settings = extension()
    settings.register({ id: 'sync', title: 'Sync', component: Page })
    settings.register({ id: 'publish', title: 'Publishing', component: Page })
  })

  it('shows the first registered section without being asked', () => {
    expect(settings.activeId.value).toBe('sync')
  })

  it('refuses a section that says nothing about how to render itself', () => {
    settings.register({ id: 'empty', title: 'Empty' })
    settings.register({ id: 'schemaless', title: 'Schemaless', schema: Type.Object({ a: Type.String() }) })

    expect(settings.sections.value.map((s) => s.id)).toEqual(['sync', 'publish'])
  })

  it('keeps a section mounted once it has been shown, so switching away does not tear its page down', () => {
    settings.open('sync')
    settings.open('publish')

    expect(settings.openedIds.value).toEqual(['sync', 'publish'])
    expect(settings.activeId.value).toBe('publish')
  })

  it('shows a section that is already up rather than a second copy of it', () => {
    settings.open('sync')
    settings.open('publish')
    settings.open('sync')

    // Same list, same order: coming back is not an opening, so the page the person left is the page
    // they return to — not a fresh one mounted beside it.
    expect(settings.openedIds.value).toEqual(['sync', 'publish'])
    expect(settings.activeId.value).toBe('sync')
  })

  it('still holds a section draft after moving to another section and back — the edit outlives the trip', () => {
    settings.open('sync')
    settings.changes.stage(draft('sync', { serverUrl: 'https://hub.example.com' }))

    settings.open('publish')
    settings.open('sync')

    expect(settings.changes.draftFor('sync')).toEqual({ serverUrl: 'https://hub.example.com' })
    expect(settings.changes.fieldCount.value).toBe(1)
  })

  it('drops an unregistered section from what is mounted and shows a neighbour instead of nothing', () => {
    settings.open('sync')
    settings.open('publish')
    settings.unregister('publish')

    expect(settings.openedIds.value).toEqual(['sync'])
    expect(settings.activeId.value).toBe('sync')
  })

  it('has nothing to show once the last section is gone', () => {
    settings.open('sync')
    settings.unregister('sync')
    settings.unregister('publish')

    expect(settings.openedIds.value).toEqual([])
    expect(settings.activeId.value).toBeNull()
  })
})
