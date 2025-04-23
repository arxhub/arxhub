import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { PluginContainer } from './plugin'

type ConfigureCallback = (params: {
  plugins: PluginContainer<ArxHub>
  extensions: ExtensionContainer
}) => Promise<void> | void

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer
  readonly logger: Logger

  constructor() {
    this.plugins = new PluginContainer()
    this.extensions = new ExtensionContainer()
    this.logger = new ConsoleLogger()
  }

  get use() {
    return this.plugins.register
  }

  async start(configure: ConfigureCallback): Promise<void> {
    // Initialization order:
    // 1. Create instances of all registered plugins
    const plugins = this.plugins.instantiate()
    for (const plugin of plugins) {
      // 2. Invoke lifecycle `create` method
      plugin.create(this)
    }
    // 3. Plugin `create` method should register extensions,
    //    Create instances of all registered extensions
    this.extensions.instantiate()
    for (const plugin of plugins) {
      // 4. Now we have all extensions, plugins can configure self or each-other
      plugin.configure(this)
    }

    await configure(this)
    await Promise.all(plugins.map((it) => it.start(this)))
  }

  async stop(): Promise<void> {
    const plugins = this.plugins.instances()
    await Promise.allSettled(plugins.map((it) => it.stop(this)))
  }
}
