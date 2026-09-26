import { ConsoleLogger } from '@arxhub/core'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { settingsBar } from '../settings-bar'
import { SettingsExtension } from '../settings-extension'

const Page = defineComponent({ name: 'Page', template: '<div />' })

function extension(): SettingsExtension {
  const logger = new ConsoleLogger()
  for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(logger, level).mockImplementation(() => {})
  const settings = new SettingsExtension({ logger })
  settings.register({ id: 'sync', title: 'Sync', icon: 'lu:refresh-cw', component: Page })
  settings.register({ id: 'publish', title: 'Publishing', component: Page })
  return settings
}

describe('settings band', () => {
  it('names the section on screen and has nothing to discard while nothing is staged', () => {
    const settings = extension()
    settings.open('publish')
    const bar = settingsBar(settings)
    expect(bar).toMatchObject({ icon: 'lu:settings', name: 'Publishing', sub: undefined })
    expect(bar?.menu?.[0]?.disabled).toBe(true)
  })

  it('discards only the staged edit of the section on screen', () => {
    const settings = extension()
    const revert = vi.fn()
    const stage = (sectionId: string) =>
      settings.changes.stage({
        sectionId,
        title: sectionId,
        values: { a: 1, b: 2 },
        keys: ['a', 'b'],
        invalid: false,
        commit: async () => {},
        revert,
      })
    stage('sync')
    stage('publish')
    settings.open('sync')
    const bar = settingsBar(settings)
    expect(bar?.sub).toBe('2 unsaved')
    bar?.menu?.[0]?.onSelect()
    expect(revert).toHaveBeenCalledOnce()
    expect(settings.changes.staged.value.map((change) => change.sectionId)).toEqual(['publish'])
  })

  it('draws no band while no section exists', () => {
    const logger = new ConsoleLogger()
    expect(settingsBar(new SettingsExtension({ logger }))).toBeNull()
  })
})
