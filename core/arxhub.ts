import { ExtensionContainer } from '~/core/stdlib/extension_container.ts'
import { PluginContainer } from '~/core/stdlib/plugin_container.ts'
import { Plugin } from '~/core/plugin'

export class ArxHub {
  readonly plugins: PluginContainer<ArxHub>
  readonly extensions: ExtensionContainer

  constructor() {
    this.plugins = new PluginContainer(this)
    this.extensions = new ExtensionContainer()
  }

  apply(plugin: Plugin<ArxHub>): void {
    this.plugins.apply(plugin.name, plugin)
  }

  async start(): Promise<void> {
    Deno.addSignalListener('SIGTERM', () => this.stop())
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
