import { LazyContainer } from '@arxhub/di'
import { aggregate, illegalState } from '@arxhub/errors'
import type { EventBus, EventMap } from '@arxhub/events'
import EventEmitter from 'eventemitter3'
import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { type Plugin, PluginContainer } from './plugin'
import type { PluginContext, PluginHost, ScopeConfigureCallback } from './plugin-context'

type ArxHubConfigureCallback = (params: { plugins: PluginContainer; extensions: ExtensionContainer }) => Promise<void> | void

export class ArxHub {
  readonly plugins: PluginContainer
  readonly extensions: ExtensionContainer
  readonly services: LazyContainer<object>
  readonly logger: Logger
  readonly events: EventBus

  private started = false
  // One PluginContext per plugin instance, reused across all its lifecycle phases (and stop()).
  private readonly contexts = new Map<Plugin, PluginContext>()
  // Per-plugin DI-scope configurers (e.g. @arxhub/vfs binding a Vfs token). Run once per plugin when
  // its context is built — register them BEFORE start().
  private readonly scopeConfigurers: ScopeConfigureCallback[] = []

  constructor() {
    this.logger = new ConsoleLogger()
    // Root DI scope for infrastructure services (e.g. RootVfs). The per-plugin PluginContext resolves
    // RootVfs from here lazily to build each plugin's home buckets.
    this.services = new LazyContainer('Service')
    this.plugins = new PluginContainer(this.logger)
    this.extensions = new ExtensionContainer({ logger: this.logger })
    this.events = new EventEmitter<EventMap>()
  }

  async start(configure?: ArxHubConfigureCallback): Promise<void> {
    // Guard against double-start: instantiate()/create() are not idempotent and the containers keep
    // their cached instances across a stop(), so a second start() would re-run create()/configure()
    // on the SAME instances and corrupt their state. There is no in-place restart — make a new
    // ArxHub instance instead.
    if (this.started) throw illegalState('ArxHub.start() called more than once; create a new ArxHub instance to restart')
    this.started = true

    // No per-plugin unload model: a start() failure does NOT unwind already-started plugins. The
    // instance is spent (`started` stays true) and the app must be restarted to recover — `stop()`
    // is the whole-app shutdown hook (dev hot-restart / process exit), not a runtime plugin-unload.
    // Initialization order:
    // 1. Create instances of all registered plugins
    const plugins = this.plugins.instantiate()
    // 1a. Setup phase: each plugin wires instance-level infrastructure via the narrow host (e.g.
    // VfsPlugin binds a per-plugin VFS scope). Runs before ANY context/scope is built, so a
    // contribution applies to every plugin — the declaring one included — independent of order.
    const host: PluginHost = {
      services: this.services,
      configureScope: (fn) => {
        this.scopeConfigurers.push(fn)
      },
    }
    this.runPhase(plugins, 'setup', (plugin) => plugin.setup(host))
    // 2. Invoke lifecycle `create` method (registers extensions)
    this.runPhase(plugins, 'create', (plugin) => plugin.create(this.context(plugin)))
    // 3. Now all extensions are registered — instantiate them
    this.extensions.instantiate()
    // 4. With all extensions available, plugins can configure self or each-other
    this.runPhase(plugins, 'configure', (plugin) => plugin.configure(this.context(plugin)))

    await configure?.(this)

    // 5. Start every plugin; collect failures instead of letting one rejection abandon the rest.
    const results = await Promise.allSettled(plugins.map((it) => it.start(this.context(it))))
    const failures = results.flatMap((r, i) => (r.status === 'rejected' ? [{ plugin: plugins[i], reason: r.reason }] : []))
    if (failures.length > 0) {
      for (const { plugin, reason } of failures) this.logger.error(`Plugin '${plugin.name}' failed during start()`, reason)
      throw aggregate(
        failures.map((f) => f.reason),
        `${failures.length} plugin(s) failed to start`,
      )
    }
  }

  async stop(): Promise<void> {
    // Stop in reverse registration order so dependents shut down before their dependencies.
    await this.stopPlugins(this.plugins.instances().reverse())
    this.started = false
  }

  // Lazily builds (and caches) the PluginContext handed to a plugin's lifecycle phases. Each plugin
  // gets its OWN child of the root services scope, then every registered configurer seeds it.
  private context(plugin: Plugin): PluginContext {
    let ctx = this.contexts.get(plugin)
    if (ctx == null) {
      const scope = this.services.child('PluginScope')
      for (const configure of this.scopeConfigurers) configure(scope, plugin)
      ctx = {
        logger: this.logger.child(`[${plugin.name}] - `),
        extensions: this.extensions,
        events: this.events,
        services: scope,
      }
      this.contexts.set(plugin, ctx)
    }
    return ctx
  }

  private async stopPlugins(plugins: Plugin[]): Promise<void> {
    const results = await Promise.allSettled(plugins.map((it) => it.stop(this.context(it))))
    results.forEach((r, i) => {
      if (r.status === 'rejected') this.logger.error(`Plugin '${plugins[i].name}' failed during stop()`, r.reason)
    })
  }

  // Runs a synchronous lifecycle phase across all plugins in registration order. A throw aborts
  // start() (the instance is spent — restart). The async phases (start/stop) run concurrently and
  // collect failures instead, so they don't go through here.
  private runPhase(plugins: Plugin[], phase: 'setup' | 'create' | 'configure', action: (plugin: Plugin) => void): void {
    for (const plugin of plugins) {
      try {
        action(plugin)
      } catch (error) {
        this.logger.error(`Plugin '${plugin.name}' failed during ${phase}()`, error)
        throw error
      }
    }
  }
}
