import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import manifest from '../manifest'
import { ShellExtension } from './extension'

export class ShellPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(ShellExtension)
  }
}
