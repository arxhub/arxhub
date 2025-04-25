import { type Plugin as ESBuildPlugin, build } from 'esbuild'
import { Bundler, type Entrypoint } from './bundler'
import { ESBuildVirtualPlugin } from './esbuild-virtual-plugin'

export class ESBuildBundler extends Bundler {
  override async bundle(entrypoint: Entrypoint): Promise<string> {
    const plugins: ESBuildPlugin[] = []

    if (entrypoint?.plugins?.virtual === true) plugins.push(ESBuildVirtualPlugin(this.files))
    if (entrypoint?.plugins?.nodePolyfill === true) plugins.push()

    const result = await build({
      stdin: {
        sourcefile: entrypoint.sourcefile,
        contents: entrypoint.content,
        loader: entrypoint.loader,
        resolveDir: process.cwd(),
      },
      bundle: true,
      treeShaking: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      sourcemap: 'inline',
      // minify: true,
      plugins,
    })

    return result.outputFiles[0].text
  }
}
