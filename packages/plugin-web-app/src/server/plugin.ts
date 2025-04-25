import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/api'
import { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/server'
import manifest from '../manifest'
import { WebAppServerExtension } from './extension'
import { entrypointRoute } from './routes/entrypoint'
import { modulesRoute } from './routes/modules'

export class WebAppServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create({ plugins, extensions }: ArxHub): void {
    extensions.register(WebAppServerExtension, () => ({
      files: extensions.get(VirtualFileSystemServerExtension).files,
    }))
  }

  override configure({ plugins, extensions }: ArxHub): void {
    const { bundler } = extensions.get(WebAppServerExtension)
    bundler.registerModule('web-component', async (files) => {
      const modules = await files.select({
        selector: { moduleType: 'web-component' },
        fields: ['pathname', 'moduleType'],
      })

      return {
        content: modules.map((it) => `import '${it.pathname}';`).join('\n'),
        loader: 'ts',
      }
    })

    const { gateway } = extensions.get(GatewayServerExtension)
    gateway.use(entrypointRoute())
    gateway.use(modulesRoute(bundler))
  }
}

export default WebAppServerPlugin
