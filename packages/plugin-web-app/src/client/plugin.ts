import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import manifest from '../manifest'
import { WebAppClientExtension } from './extension'

export class WebAppClientPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create({ plugins, extensions }: ArxHub): void {
    extensions.register(WebAppClientExtension)
  }

  override configure({ plugins, extensions }: ArxHub): void {}
}

export default WebAppClientPlugin
