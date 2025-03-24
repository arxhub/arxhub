import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { type Plugin, PluginContainer } from './plugin'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer
  readonly logger: Logger

  constructor() {
    this.plugins = new PluginContainer(this)
    this.extensions = new ExtensionContainer()
    this.logger = new ConsoleLogger()
  }

  apply(plugin: Plugin<ArxHub>): void {
    this.plugins.register(plugin)
  }

  async start(): Promise<void> {
    const plugins = this.plugins.values()
    await Promise.all(plugins.map((it) => it.create(this)))
    await Promise.all(plugins.map((it) => it.configure(this)))
    await Promise.all(plugins.map((it) => it.start(this)))
  }

  async stop(): Promise<void> {
    const plugins = this.plugins.values()
    await Promise.allSettled(plugins.map((it) => it.stop(this)))
  }
}
