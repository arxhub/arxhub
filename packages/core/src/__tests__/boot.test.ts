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
