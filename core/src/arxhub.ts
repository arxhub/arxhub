import { ExtensionContainer } from './extension'
import { type Plugin, PluginContainer } from './plugin'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer

  constructor() {
    this.plugins = new PluginContainer(this)
    this.extensions = new ExtensionContainer()
    process.addListener('SIGTERM', () => this.stop())
  }

  apply(plugin: Plugin<ArxHub>): void {
    this.plugins.apply(plugin)
  }

  async start(): Promise<void> {
    await Promise.all(this.plugins.values().map((it) => it.start?.(this) ?? Promise.resolve()))
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.plugins.values().map((it) => it.stop?.(this) ?? Promise.resolve()))
  }
}
