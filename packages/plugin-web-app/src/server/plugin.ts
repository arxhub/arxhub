import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import GatewayServerExtension from '@arxhub/plugin-gateway/server'
import { isNodeError } from '@arxhub/stdlib/errors/app-error'
import manifest from '../manifest'
import { WebAppServerExtension } from './extension'
import { entrypointRoute } from './routes/entrypoint'
import { modulesRoute } from './routes/modules'

export class WebAppServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create({ plugins, extensions }: ArxHub): void {
    // extensions.register(WebAppServerExtension, () => ({
    //   files: extensions.get(VirtualFileSystemExtension).files,
    // }))
  }

  override configure({ plugins, extensions }: ArxHub): void {
    // const { bundler } = extensions.get(WebAppServerExtension)

    // bundler.registerModule('web-component.js', async (files) => {
    //   const modules = await files.select({
    //     selector: { moduleType: 'web-component' },
    //     fields: ['pathname', 'moduleType'],
    //   })

    //   return {
    //     sourcefile: 'entrypoint.ts',
    //     contentType: 'application/javascript',
    //     content: modules.map((it) => `import '${it.pathname}'`).join('\n'),
    //     loader: 'ts',
    //     plugins: {
    //       virtual: true,
    //     },
    //   }
    // })

    // bundler.registerModule('client.js', async (files) => {
    //   const lines: string[] = []

    //   lines.push(`import { ArxHub } from '@arxhub/core'`)
    //   lines.push()
    //   lines.push('const hub = new ArxHub()')
    //   lines.push()
    //   const counter = 0
    //   for (const plugin of plugins.instances()) {
    //     try {
    //       const name = plugin.manifest.name
    //       require.resolve(`${name}/client`)
    //       lines.push(`import Plugin${counter} from '${name}/client'`)
    //       lines.push(`hub.plugins.register(Plugin${counter})`)
    //     } catch (err) {
    //       if (!isNodeError(err, 'ERR_PACKAGE_PATH_NOT_EXPORTED')) {
    //         this.logger.error(err)
    //         throw err
    //       }
    //     }
    //   }
    //   lines.push()
    //   lines.push('void hub.start()')
    //   lines.push()

    //   return {
    //     sourcefile: 'entrypoint.ts',
    //     contentType: 'application/javascript',
    //     content: lines.join('\n'),
    //     loader: 'ts',
    //     plugins: {
    //       nodePolyfill: true,
    //     },
    //   }
    // })

    // const { gateway } = extensions.get(GatewayServerExtension)
    // gateway.use(entrypointRoute())
    // gateway.use(modulesRoute(bundler))
  }
}

export default WebAppServerPlugin
