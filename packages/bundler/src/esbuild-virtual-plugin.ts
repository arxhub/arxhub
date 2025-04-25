import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Plugin as ESBuildPlugin, Loader } from 'esbuild'

export function ESBuildVirtualPlugin(files: VirtualFileSystem): ESBuildPlugin {
  return {
    name: 'virtual-files',
    setup(build) {
      build.onLoad({ filter: /.*/ }, async (args) => {
        const contents = await files.readTextFile(args.path)
        let loader: Loader = 'default'

        if (args.path.endsWith('.js')) loader = 'js'
        if (args.path.endsWith('.ts')) loader = 'ts'
        if (args.path.endsWith('.css')) loader = 'css'
        if (args.path.endsWith('.module.css')) loader = 'local-css'

        return { contents, loader }
      })
    },
  }
}
