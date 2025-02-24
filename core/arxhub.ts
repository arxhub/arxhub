import { ExtensionContainer } from '~/core/extension.ts'
import { Plugin, PluginContainer } from '~/core/plugin.ts'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer

  constructor() {
    this.plugins = new PluginContainer(this)
    this.extensions = new ExtensionContainer()
    Deno.addSignalListener('SIGTERM', () => this.stop())
  }

  apply(plugin: Plugin<ArxHub>): void {
    this.plugins.apply(plugin)
  }

  async start(): Promise<void> {
    await Promise.all(
      this.plugins.values()
        .map((it) => it.start?.(this) ?? Promise.resolve()),
    )
  }

  async stop(): Promise<void> {
    await Promise.allSettled(
      this.plugins.values()
        .map((it) => it.stop?.(this) ?? Promise.resolve()),
    )
  }
}
