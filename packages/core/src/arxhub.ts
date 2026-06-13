import { illegalState } from '@arxhub/errors'
import type { EventBus, EventMap } from '@arxhub/events'
import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import EventEmitter from 'eventemitter3'
import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { type Plugin, PluginContainer } from './plugin'

type ConfigureCallback = (params: { plugins: PluginContainer<ArxHub>; extensions: ExtensionContainer }) => Promise<void> | void

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer
  readonly services: LazyContainer<object>
  readonly logger: Logger
  readonly events: EventBus

  private started = false

  constructor() {
    this.logger = new ConsoleLogger()
    // Root DI scope for infrastructure services (e.g. RootVfs). Each plugin gets a child of this,
    // so per-plugin bindings (PluginHome) stay isolated while shared services fall through here.
    this.services = new LazyContainer('Service')
    this.plugins = new PluginContainer(this.logger, this.services)
    this.extensions = new ExtensionContainer({ logger: this.logger })
    this.events = new EventEmitter<EventMap>()
  }

  async start(configure?: ConfigureCallback): Promise<void> {
    // Guard against double-start: instantiate()/create() are not idempotent and the containers keep
    // their cached instances across a stop(), so a second start() would re-run create()/configure()
    // on the SAME instances and corrupt their state. There is no in-place restart — make a new
    // ArxHub instance instead.
    if (this.started) throw illegalState('ArxHub.start() called more than once; create a new ArxHub instance to restart')
    this.started = true

    // Track the plugins we actually invoke start() on, so a failure rolls back ONLY those — calling
    // stop() on a plugin whose start() never ran can trip cleanup that assumes start()-allocated state.
    const startedPlugins: Plugin<ArxHub>[] = []
    try {
      // Initialization order:
      // 1. Create instances of all registered plugins
      const plugins = this.plugins.instantiate()
      for (const plugin of plugins) {
        // 2. Invoke lifecycle `create` method (registers extensions)
        this.runPhase(plugin, 'create', () => plugin.create(this))
      }
      // 3. Now all extensions are registered — instantiate them
      this.extensions.instantiate()
      for (const plugin of plugins) {
        // 4. With all extensions available, plugins can configure self or each-other
        this.runPhase(plugin, 'configure', () => plugin.configure(this))
      }

      await configure?.(this)

      // 5. Start every plugin; collect failures instead of letting one rejection abandon the rest.
      const results = await Promise.allSettled(
        plugins.map((it) => {
          startedPlugins.push(it)
          return it.start(this)
        }),
      )
      const failures = results.flatMap((r, i) => (r.status === 'rejected' ? [{ plugin: plugins[i], reason: r.reason }] : []))
      if (failures.length > 0) {
        for (const { plugin, reason } of failures) this.logger.error(`Plugin '${plugin.name}' failed during start()`, reason)
        throw new AggregateError(
          failures.map((f) => f.reason),
          `${failures.length} plugin(s) failed to start`,
        )
      }
    } catch (error) {
      // Unwind only the started plugins (reverse order). `started` stays true: this instance is
      // spent, and the message above directs callers to a fresh instance rather than a retry.
      await this.stopPlugins(startedPlugins.slice().reverse())
      throw error
    }
  }

  async stop(): Promise<void> {
    // Stop in reverse registration order so dependents shut down before their dependencies.
    await this.stopPlugins(this.plugins.instances().reverse())
    this.started = false
  }

  private async stopPlugins(plugins: Plugin<ArxHub>[]): Promise<void> {
    const results = await Promise.allSettled(plugins.map((it) => it.stop(this)))
    results.forEach((r, i) => {
      if (r.status === 'rejected') this.logger.error(`Plugin '${plugins[i].name}' failed during stop()`, r.reason)
    })
  }

  private runPhase(plugin: { name: string }, phase: 'create' | 'configure', fn: () => void): void {
    try {
      fn()
    } catch (error) {
      this.logger.error(`Plugin '${plugin.name}' failed during ${phase}()`, error)
      throw error
    }
  }
}
