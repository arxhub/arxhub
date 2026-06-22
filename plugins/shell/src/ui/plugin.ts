import { Plugin, type PluginArgs, type PluginContext, type PluginManifest } from '@arxhub/core'
import { ShellExtension } from './extension'

const manifest: PluginManifest = {
  name: 'Shell',
  version: '0.1.0',
  author: 'arxhub',
  description: 'App shell layout with sidebar navigation registry',
}

export class ShellPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(ShellExtension)
  }
}
