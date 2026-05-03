import { Plugin, type PluginArgs, type PluginManifest } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import { ShellExtension } from './extension'

const manifest: PluginManifest = {
  name: 'Shell',
  version: '0.1.0',
  author: 'arxhub',
  description: 'App shell layout with sidebar navigation registry',
}

export class ShellPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    arxhub.extensions.register(ShellExtension)
  }
}
