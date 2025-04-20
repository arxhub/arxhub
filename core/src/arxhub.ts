import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'
import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { type Plugin, type PluginArgs, PluginContainer } from './plugin'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer
  readonly logger: Logger

  constructor(factories: NamedFactory<Plugin<ArxHub>, [PluginArgs]>[]) {
    this.plugins = new PluginContainer(factories)
    this.extensions = new ExtensionContainer()
    this.logger = new ConsoleLogger()

    // Initialization order:
    // 1. Create instances of all registered plugins
    const plugins = this.plugins.instantiate({ logger: this.logger })
    for (const plugin of plugins) {
      // 2. Invoke lifecycle `create` method
      plugin.create(this)
    }
    // 3. Plugin `create` method should register extensions,
    //    Create instances of all registered extensions
    this.extensions.instantiate({ logger: this.logger })
    for (const plugin of plugins) {
      // 4. Now we have all extensions, plugins can configure self or each-other
      plugin.configure(this)
    }
  }

  async start(): Promise<void> {
    const plugins = this.plugins.instances()
    await Promise.all(plugins.map((it) => it.start(this)))
  }

  async stop(): Promise<void> {
    const plugins = this.plugins.instances()
    await Promise.allSettled(plugins.map((it) => it.stop(this)))
  }
}
