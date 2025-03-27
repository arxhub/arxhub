import { ExtensionContainer } from './extension'
import { ConsoleLogger, type Logger } from './logger'
import { type Plugin, PluginContainer } from './plugin'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer
  readonly logger: Logger

  static async create(...plugins: Plugin<ArxHub>[]): Promise<ArxHub> {
    const arxhub = new ArxHub(plugins)
    await Promise.all(plugins.map((it) => it.create(arxhub)))
    await Promise.all(plugins.map((it) => it.configure(arxhub)))
    return arxhub
  }

  private constructor(plugins: Plugin<ArxHub>[]) {
    this.plugins = new PluginContainer(this, plugins)
    this.extensions = new ExtensionContainer()
    this.logger = new ConsoleLogger()
  }

  async start(): Promise<void> {
    const plugins = this.plugins.values()
    await Promise.all(plugins.map((it) => it.start(this)))
  }

  async stop(): Promise<void> {
    const plugins = this.plugins.values()
    await Promise.allSettled(plugins.map((it) => it.stop(this)))
  }
}
