import type { PluginInfo } from '@arxhub/core'
import { describe, expect, it } from 'vitest'
import { applyBootEvent, type BootLedger, emptyLedger } from '../boot-ledger'

function roster(...plugins: Partial<PluginInfo>[]): PluginInfo[] {
  return plugins.map((it) => ({ name: 'p', version: '1.0.0', essential: false, enabled: true, ...it }))
}

function seeded(...plugins: Partial<PluginInfo>[]): BootLedger {
  const ledger = emptyLedger()
  applyBootEvent(ledger, { kind: 'roster', roster: roster(...plugins) })
  return ledger
}

function shape(ledger: BootLedger) {
  return ledger.entries.map((it) => [it.name, it.state, it.phase])
}

describe('boot ledger', () => {
  it('lists a switched-off plugin rather than leaving it out', () => {
    const ledger = seeded({ name: 'shell' }, { name: 'sync', enabled: false })

    // Omitting it would read as a roster that forgot about it, which is the opposite of what a boot
    // screen is for. It is listed and it is not counted towards the total.
    expect(shape(ledger)).toEqual([
      ['shell', 'waiting', null],
      ['sync', 'off', null],
    ])
    expect(ledger.total).toBe(1)
  })

  it('is only ready once the plugin is through start, not through any finished phase', () => {
    const ledger = seeded({ name: 'shell' })

    for (const phase of ['setup', 'create', 'configure'] as const) {
      applyBootEvent(ledger, { kind: 'step', step: { plugin: 'shell', phase, status: 'running' } })
      applyBootEvent(ledger, { kind: 'step', step: { plugin: 'shell', phase, status: 'done' } })
      expect(ledger.entries[0].state).toBe('running')
      expect(ledger.ready).toBe(0)
    }

    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'shell', phase: 'start', status: 'done' } })
    expect(ledger.entries[0].state).toBe('ready')
    expect(ledger.ready).toBe(1)
  })

  it('keeps the phase a failure happened in', () => {
    const ledger = seeded({ name: 'search' })
    const error = new Error('index would not open')
    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'search', phase: 'start', status: 'failed', error } })

    expect(shape(ledger)).toEqual([['search', 'failed', 'start']])
    expect(ledger.entries[0].error).toBe(error)
    // A failure is not progress: the bar must not creep forward on it.
    expect(ledger.ready).toBe(0)
  })

  it('holds one failed among several done, which is what start() concurrency produces', () => {
    const ledger = seeded({ name: 'shell' }, { name: 'search' }, { name: 'sync' })
    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'shell', phase: 'start', status: 'done' } })
    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'search', phase: 'start', status: 'failed', error: new Error('x') } })
    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'sync', phase: 'start', status: 'running' } })

    expect(shape(ledger)).toEqual([
      ['shell', 'ready', 'start'],
      ['search', 'failed', 'start'],
      ['sync', 'running', 'start'],
    ])
    expect(ledger.ready).toBe(1)
    expect(ledger.total).toBe(3)
  })

  it('ignores a step for a plugin the roster never mentioned', () => {
    const ledger = seeded({ name: 'shell' })
    applyBootEvent(ledger, { kind: 'step', step: { plugin: 'ghost', phase: 'setup', status: 'done' } })

    // Growing a second, half-described list beside the real one would be worse than dropping it.
    expect(shape(ledger)).toEqual([['shell', 'waiting', null]])
  })

  it('a second roster replaces the first rather than appending to it', () => {
    const ledger = seeded({ name: 'shell' })
    applyBootEvent(ledger, { kind: 'roster', roster: roster({ name: 'settings' }) })

    expect(shape(ledger)).toEqual([['settings', 'waiting', null]])
    expect(ledger.total).toBe(1)
  })

  it('records that the boot ended', () => {
    const ledger = seeded({ name: 'shell' })
    expect(ledger.finished).toBe(false)
    applyBootEvent(ledger, { kind: 'finished' })
    expect(ledger.finished).toBe(true)
  })
})
