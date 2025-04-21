import type { PluginManifest } from '@arxhub/core'
import Elysia from 'elysia'
import { build } from 'esbuild'
import template from '../files/client-bundle.ts?raw'

export function createClientBundleRouter(plugins: PluginManifest[]) {
  return new Elysia().get('/scripts/client-bundle.js', async () => {
    // TODO: Write a code that use that args, for now just hard-code imports and configure in template
    const args = {
      imports: '',
      plugins: '',
      configure: '',
    }

    const result = await build({
      stdin: {
        contents: template
          .replace('/*imports*/', args.imports)
          .replace('/*plugins*/', args.plugins)
          .replace('/*configure*/', args.configure),
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'client-bundle.ts',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      sourcemap: 'inline',
    })

    const bundledCode = result.outputFiles[0].text

    return new Response(bundledCode, {
      headers: { 'Content-Type': 'application/javascript' },
    })

    // const clientPlugins = plugins
    //   .map((it) => `${it.name}/client`)
    //   .filter((it) => {
    //     try {
    //       require.resolve(it)
    //       return true
    //     } catch (e) {
    //       console.warn(e)
    //       return false
    //     }
    //   })
    // console.log(clientPlugins)

    // return new Response('console.log("Hello World!");', {
    //   headers: { 'Content-Type': 'application/javascript' },
    // })
  })
}
