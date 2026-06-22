import { describe, expect, test } from 'vitest'
import { ArxHub } from '../arxhub'
import { definePluginManifest, Plugin, type PluginArgs } from '../plugin'
import type { PluginContext, PluginHost } from '../plugin-context'

// A shared infrastructure service bound in the root scope, and a per-plugin token a configurer seeds.
class RootService {
  readonly value = 'root'
}
class ScopedToken {
  constructor(readonly id: string) {}
}

let captured: PluginContext | undefined
const seenIds: string[] = []

// Wires its scope configurer in setup() — so just registering it seeds the per-plugin token, with no
// manual arxhub.configureScope() call. The configurer also applies to this plugin itself.
class TesterPlugin extends Plugin {
  override setup(host: PluginHost): void {
    host.configureScope((scope, plugin) => {
      seenIds.push(plugin.manifest.name)
      scope.register(ScopedToken, () => [plugin.manifest.name])
    })
  }

  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'tester', version: '0.0.0', author: 'test' }))
  }
  override start(ctx: PluginContext): Promise<void> {
    captured = ctx
    return Promise.resolve()
  }
}

describe('PluginContext + scope configurers', () => {
  test('a plugin setup() seeds every plugin child scope with its manifest id', async () => {
    const arxhub = new ArxHub()
    arxhub.services.register(RootService)
    arxhub.plugins.register(TesterPlugin)

    await arxhub.start()

    // The static configurer ran once for the plugin, with its manifest id — no manual configureScope().
    expect(seenIds).toEqual(['tester'])

    const ctx = captured
    expect(ctx).toBeDefined()
    if (ctx == null) throw new Error('no ctx')

    // The plugin's scope falls through to the shared root service…
    expect(ctx.services.get(RootService).value).toBe('root')
    // …and the configurer-seeded token is scoped to this plugin's id.
    expect(ctx.services.get(ScopedToken).id).toBe('tester')

    // The context exposes the shared extensions + events, not the whole ArxHub.
    expect(ctx.extensions).toBe(arxhub.extensions)
    expect(ctx.events).toBe(arxhub.events)
  })
})
