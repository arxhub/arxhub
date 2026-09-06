import { describe, expect, test } from 'vitest'
import { ArxHub } from '../arxhub'
import { bootFailures } from '../boot'
import { definePluginManifest, Plugin, type PluginArgs } from '../plugin'
import type { PluginContext } from '../plugin-context'

const phases: string[] = []

function trace(name: string, phase: string): void {
  phases.push(`${name}:${phase}`)
}

class Recorder extends Plugin {
  override create(ctx: PluginContext): void {
    super.create(ctx)
    trace(this.manifest.name, 'create')
  }
  override start(ctx: PluginContext): Promise<void> {
    trace(this.manifest.name, 'start')
    return super.start(ctx)
  }
  override stop(ctx: PluginContext): Promise<void> {
    trace(this.manifest.name, 'stop')
    return super.stop(ctx)
  }
}

class OptionalPlugin extends Recorder {
  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'optional', version: '0.0.0', author: 'test' }))
  }
}

class EssentialPlugin extends Recorder {
  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'essential', version: '0.0.0', author: 'test', essential: true }))
  }
}

class BrokenConfigurePlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'broken-configure', version: '0.0.0', author: 'test' }))
  }
  override configure(): void {
    throw new Error('configure blew up')
  }
}

class BrokenStartPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'broken-start', version: '0.0.0', author: 'test' }))
  }
  override start(): Promise<void> {
    return Promise.reject(new Error('start blew up'))
  }
}

describe('boot policy', () => {
  test('a disabled plugin runs no phase at all, and is not stopped either', async () => {
    phases.length = 0
    const arxhub = new ArxHub({ disabled: ['optional'] })
    arxhub.plugins.register(OptionalPlugin)
    arxhub.plugins.register(EssentialPlugin)

    await arxhub.start()
    await arxhub.stop()

    expect(phases).toEqual(['essential:create', 'essential:start', 'essential:stop'])
  })

  test('maintenance boots the essential plugins only, whatever the disabled list says', async () => {
    phases.length = 0
    const arxhub = new ArxHub({ maintenance: true, disabled: ['essential'] })
    arxhub.plugins.register(OptionalPlugin)
    arxhub.plugins.register(EssentialPlugin)

    await arxhub.start()

    expect(phases).toEqual(['essential:create', 'essential:start'])
  })

  test('the catalog reports every registered plugin and whether this boot ran it', async () => {
    const arxhub = new ArxHub({ disabled: ['optional'] })
    arxhub.plugins.register(OptionalPlugin)
    arxhub.plugins.register(EssentialPlugin)

    await arxhub.start()

    expect(arxhub.catalog).toEqual([
      { name: 'optional', version: '0.0.0', description: undefined, essential: false, enabled: false },
      { name: 'essential', version: '0.0.0', description: undefined, essential: true, enabled: true },
    ])
  })
})

describe('boot failures', () => {
  test('a configure() failure names the plugin and the phase', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(BrokenConfigurePlugin)

    const error = await arxhub.start().then(
      () => null,
      (it: unknown) => it,
    )

    expect(bootFailures(error)).toMatchObject([{ plugin: 'broken-configure', phase: 'configure' }])
  })

  test('start() failures are collected per plugin, not just the first', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(BrokenStartPlugin)
    arxhub.plugins.register(EssentialPlugin)

    const error = await arxhub.start().then(
      () => null,
      (it: unknown) => it,
    )

    expect(bootFailures(error)).toMatchObject([{ plugin: 'broken-start', phase: 'start' }])
  })

  // The catalog has to survive the failure: the crash screen offers the roster of switches, and it only
  // ever renders when the boot did not finish.
  test('the catalog is filled even when the boot dies', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(BrokenConfigurePlugin)

    await expect(arxhub.start()).rejects.toThrow()

    expect(arxhub.catalog.map((it) => it.name)).toEqual(['broken-configure'])
  })

  test('an error from outside any plugin carries no failures to attribute', () => {
    expect(bootFailures(new Error('nope'))).toBeNull()
  })
})

describe('boot progress', () => {
  function watch(arxhub: ArxHub) {
    const steps: string[] = []
    const roster: string[][] = []
    const finished: { failures: readonly { plugin: string | null; phase: string }[] }[] = []
    arxhub.boot.on('roster', (it) => roster.push(it.map((p) => `${p.name}:${p.enabled}`)))
    arxhub.boot.on('step', (it) => steps.push(`${it.plugin}:${it.phase}:${it.status}`))
    arxhub.boot.on('finished', (it) => finished.push(it))
    return { steps, roster, finished }
  }

  test('announces the roster once, before any phase has run', async () => {
    const arxhub = new ArxHub({ disabled: ['optional'] })
    arxhub.plugins.register(EssentialPlugin)
    arxhub.plugins.register(OptionalPlugin)
    const seen = watch(arxhub)
    await arxhub.start()

    // Once, and carrying the plugin the boot skipped — a screen must be able to say "off" rather than
    // leave a plugin out and look like it forgot about it.
    expect(seen.roster).toEqual([['essential:true', 'optional:false']])
    // Nothing about a skipped plugin ever runs, so it contributes no steps.
    expect(seen.steps.some((it) => it.startsWith('optional:'))).toBe(false)
  })

  test('walks every phase of every plugin, running before done', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(EssentialPlugin)
    const seen = watch(arxhub)
    await arxhub.start()

    expect(seen.steps).toEqual([
      'essential:setup:running',
      'essential:setup:done',
      'essential:create:running',
      'essential:create:done',
      'essential:configure:running',
      'essential:configure:done',
      'essential:start:running',
      'essential:start:done',
    ])
    expect(seen.finished).toEqual([{ failures: [] }])
  })

  test('a synchronous phase failure is announced, and the boot finishes with it', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(BrokenConfigurePlugin)
    const seen = watch(arxhub)
    await expect(arxhub.start()).rejects.toThrow()

    expect(seen.steps).toContain('broken-configure:configure:failed')
    expect(seen.steps).not.toContain('broken-configure:configure:done')
    expect(seen.finished).toHaveLength(1)
    expect(seen.finished[0].failures.map((it) => `${it.plugin}:${it.phase}`)).toEqual(['broken-configure:configure'])
  })

  test('a start failure names the plugin, and the plugins beside it still report done', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(EssentialPlugin)
    arxhub.plugins.register(BrokenStartPlugin)
    const seen = watch(arxhub)
    await expect(arxhub.start()).rejects.toThrow()

    // start() runs every plugin at once, so the healthy one is not held back by the broken one — the
    // screen has to be able to show one failed among several done.
    expect(seen.steps).toContain('essential:start:done')
    expect(seen.steps).toContain('broken-start:start:failed')
    expect(seen.finished[0].failures.map((it) => it.plugin)).toEqual(['broken-start'])
  })

  test('a listener that throws does not take the boot with it', async () => {
    const arxhub = new ArxHub()
    arxhub.plugins.register(EssentialPlugin)
    arxhub.boot.on('step', () => {
      throw new Error('the screen is broken')
    })

    // The thing being watched matters more than the thing watching it.
    await expect(arxhub.start()).resolves.toBeUndefined()
  })
})
