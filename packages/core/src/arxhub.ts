import { LazyContainer } from '@arxhub/di'
import { bootFailed, illegalState } from '@arxhub/errors'
import { createEventBus, type EventBus, type EventMap, type TypedEventBus } from '@arxhub/events'
import { createRootLogger, type LogBuffer, LogBufferKey, type Logger } from '@arxhub/logger'
import type { BootEvents, BootFailure, BootOptions, BootPhase, PluginInfo } from './boot'
import { ExtensionContainer } from './extension'
import { type Plugin, PluginContainer } from './plugin'
import type { PluginContext, PluginHost, ScopeConfigureCallback } from './plugin-context'

type ArxHubConfigureCallback = (params: { plugins: PluginContainer; extensions: ExtensionContainer }) => Promise<void> | void

export class ArxHub {
  readonly plugins: PluginContainer
  readonly extensions: ExtensionContainer
  readonly services: LazyContainer<object>
  readonly logger: Logger
  // The application-wide live log buffer the root logger feeds; bound into `services` under
  // LogBufferKey so the logger plugin's panel/file writer resolve this exact instance.
  readonly logBuffer: LogBuffer
  readonly events: EventBus
  // What this boot is doing, while it is doing it. Its own bus, not `events`: a boot screen has to
  // subscribe before any plugin exists, and `events` is the plugins' channel. See BootEvents.
  readonly boot: TypedEventBus<BootEvents>
  // This boot runs the essential plugins only. Surfaced so the UI can say so (and offer a way out)
  // instead of the app silently looking half-empty.
  readonly maintenance: boolean

  private started = false
  private readonly disabled: ReadonlySet<string>
  // Filled by start(), right after instantiation and before any phase runs — so it is available even
  // when the boot then fails, which is exactly when someone needs to see the roster.
  private roster: PluginInfo[] = []
  // The plugins this boot actually ran. stop() must walk these and no others: a skipped plugin never
  // got a context, let alone a start().
  private running: Plugin[] = []
  // One PluginContext per plugin instance, reused across all its lifecycle phases (and stop()).
  private readonly contexts = new Map<Plugin, PluginContext>()
  // Per-plugin DI-scope configurers (e.g. @arxhub/vfs binding a Vfs token). Run once per plugin when
  // its context is built — register them BEFORE start().
  private readonly scopeConfigurers: ScopeConfigureCallback[] = []

  constructor(options: BootOptions = {}) {
    this.maintenance = options.maintenance ?? false
    this.disabled = new Set(options.disabled ?? [])
    const { logger, buffer } = createRootLogger()
    this.logger = logger
    this.logBuffer = buffer
    // Root DI scope for infrastructure services (e.g. RootVfs). The per-plugin PluginContext resolves
    // RootVfs from here lazily to build each plugin's home buckets.
    this.services = new LazyContainer('Service')
    // Expose the live log buffer to plugins (the logger plugin renders + persists it) via DI.
    this.services.bind(LogBufferKey, () => this.logBuffer)
    this.plugins = new PluginContainer(this.logger)
    this.extensions = new ExtensionContainer({ logger: this.logger })
    // A listener that throws is reported and skipped rather than left to unwind the emitter's caller: an
    // event is announced from the middle of an operation that has already happened (a panel is open, a
    // group is gone), and one plugin's bad listener must not abandon that operation half-applied.
    this.events = createEventBus<EventMap>({
      onError: (error, event) => this.logger.error(`A listener for '${event}' threw`, error),
    })
    // A progress listener that throws must never be the reason a boot fails — the screen watching is
    // strictly less important than the thing it is watching.
    this.boot = createEventBus<BootEvents>({
      onError: (error, event) => this.logger.error(`A boot listener for '${event}' threw`, error),
    })
  }

  // Every registered plugin and whether this boot ran it. Empty until start() has instantiated them;
  // a crash screen reads this to offer the roster even though the boot itself went nowhere.
  get catalog(): readonly PluginInfo[] {
    return this.roster
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
    // 1. Create instances of all registered plugins, then drop the ones this boot must skip. The
    // roster is recorded first so it survives a failure below.
    const instances = this.instantiatePlugins()
    this.roster = instances.map((it) => ({
      name: it.manifest.name,
      version: it.manifest.version,
      description: it.manifest.description,
      essential: it.manifest.essential ?? false,
      enabled: this.isEnabled(it),
    }))
    const plugins = instances.filter((_, i) => this.roster[i].enabled)
    this.running = plugins
    // Before any phase: a screen can draw the whole roster at once instead of growing it plugin by
    // plugin, and it still has something to show if the very first phase dies.
    this.boot.emit('roster', this.roster)
    for (const it of this.roster) {
      if (!it.enabled) this.logger.warn(`Plugin '${it.name}' is switched off — skipping it`)
    }
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
    // Announced per plugin as it settles rather than all at the end: start() is the one phase where a
    // boot spends real time, so it is the only one a progress screen can actually show moving.
    const results = await Promise.allSettled(
      plugins.map(async (it) => {
        const plugin = it.manifest.name
        this.boot.emit('step', { plugin, phase: 'start', status: 'running' })
        try {
          await it.start(this.context(it))
          this.boot.emit('step', { plugin, phase: 'start', status: 'done' })
        } catch (error) {
          this.boot.emit('step', { plugin, phase: 'start', status: 'failed', error })
          throw error
        }
      }),
    )
    const failures: BootFailure[] = results.flatMap((r, i) =>
      r.status === 'rejected' ? [{ plugin: plugins[i].manifest.name, phase: 'start' as const, error: r.reason }] : [],
    )
    this.boot.emit('finished', { failures })
    if (failures.length > 0) {
      for (const { plugin, error } of failures) this.logger.error(`Plugin '${plugin}' failed during start()`, error)
      throw bootFailed(failures, `${failures.length} plugin(s) failed to start`)
    }
  }

  async stop(): Promise<void> {
    // Stop in reverse registration order so dependents shut down before their dependencies.
    await this.stopPlugins([...this.running].reverse())
    this.started = false
  }

  // A plugin constructor throwing takes the whole roster with it — the container builds them in one
  // pass, so there are no instances left to name and nothing specific to offer switching off.
  // Maintenance mode is the only way out of that one.
  private instantiatePlugins(): Plugin[] {
    try {
      return this.plugins.instantiate()
    } catch (error) {
      this.logger.error('Failed to instantiate the registered plugins', error)
      throw bootFailed([{ plugin: null, phase: 'instantiate', error }], 'Failed to instantiate the registered plugins')
    }
  }

  private isEnabled(plugin: Plugin): boolean {
    if (plugin.manifest.essential) return true
    return !this.maintenance && !this.disabled.has(plugin.manifest.name)
  }

  // Lazily builds (and caches) the PluginContext handed to a plugin's lifecycle phases. Each plugin
  // gets its OWN child of the root services scope, then every registered configurer seeds it.
  private context(plugin: Plugin): PluginContext {
    let ctx = this.contexts.get(plugin)
    if (ctx == null) {
      const scope = this.services.child('PluginScope')
      for (const configure of this.scopeConfigurers) configure(scope, plugin)
      ctx = {
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
  private runPhase(plugins: Plugin[], phase: Extract<BootPhase, 'setup' | 'create' | 'configure'>, action: (plugin: Plugin) => void): void {
    for (const plugin of plugins) {
      const name = plugin.manifest.name
      this.boot.emit('step', { plugin: name, phase, status: 'running' })
      try {
        action(plugin)
        this.boot.emit('step', { plugin: name, phase, status: 'done' })
      } catch (error) {
        this.boot.emit('step', { plugin: name, phase, status: 'failed', error })
        this.boot.emit('finished', { failures: [{ plugin: name, phase, error }] })
        this.logger.error(`Plugin '${plugin.name}' failed during ${phase}()`, error)
        // Wrapped rather than rethrown raw: whoever catches this has to know WHICH plugin died and
        // where, or it cannot offer to switch that one off and try again.
        throw bootFailed([{ plugin: plugin.manifest.name, phase, error }], `Plugin '${plugin.manifest.name}' failed during ${phase}()`)
      }
    }
  }
}
