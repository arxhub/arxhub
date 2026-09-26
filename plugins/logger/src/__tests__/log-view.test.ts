import { ConsoleLogger } from '@arxhub/core'
import { LogBuffer } from '@arxhub/logger'
import { describe, expect, it } from 'vitest'
import { logBar, logView } from '../log-view'
import { LoggerExtension } from '../logger-extension'

function setup() {
  const buffer = new LogBuffer()
  const logger = new ConsoleLogger()
  const ext = new LoggerExtension({ logger, buffer })
  return { buffer, ext, view: logView(ext, logger) }
}

describe('log view', () => {
  it('is one view per extension, so the panel and the sheet filter the same log', () => {
    const { ext, view } = setup()
    expect(logView(ext, new ConsoleLogger())).toBe(view)
  })

  it('filters by level and text, and the band names the filter and counts errors', () => {
    const { buffer, view } = setup()
    buffer.push({ level: 30, time: 1, msg: 'opened vault' })
    buffer.push({ level: 50, time: 2, msg: 'sync failed' })
    buffer.push({ level: 50, time: 3, msg: 'index failed' })
    expect(logBar(view)).toMatchObject({ name: 'All levels', sub: '2 errors' })

    view.toggle('debug')
    view.toggle('info')
    expect(view.visible.value.map((r) => r.msg)).toEqual(['sync failed', 'index failed'])
    expect(logBar(view).name).toBe('Warnings, Errors')

    view.search.value = 'SYNC'
    expect(view.visible.value.map((r) => r.msg)).toEqual(['sync failed'])

    view.showAllLevels()
    expect(view.allLevels.value).toBe(true)
  })

  it('does not offer to clear a past session', async () => {
    const { view } = setup()
    await view.showSource('logs/session-1.ndjson')
    expect(logBar(view).sub).toBe('session-1.ndjson · 0 errors')
    expect(logBar(view).menu?.[0]?.disabled).toBe(true)
  })
})
