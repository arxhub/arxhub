import { Bundler } from './bundler'

export class ESBuildBundler extends Bundler {
  build(moduleType: string): Promise<string> {
    throw new Error('Method not implemented.')
  }
}


    // const entryPointContent = components.map((file) => `import "${file.pathname}"`).join('\n')
    // const virtualFiles: Record<string, string> = {
    //   'entry.ts': entryPointContent,
    //   ...Object.fromEntries(await Promise.all(components.map(async (file) => [file.pathname, await file.readText()]))),
    // }

    // const result = await build({
    //   entryPoints: ['entry.ts'],
    //   bundle: true,
    //   write: false,
    //   platform: 'browser',
    //   format: 'esm',
    //   sourcemap: 'inline',
    //   plugins: [
    //     {
    //       name: 'virtual-files',
    //       setup(build) {
    //         build.onResolve({ filter: /.*/ }, (args) => {
    //           if (args.path === 'entry.ts') {
    //             return { path: args.path, namespace: 'virtual' }
    //           }
    //           return { path: args.path }
    //         })
    //         build.onLoad({ filter: /.*/ }, (args) => {
    //           return {
    //             contents: virtualFiles[args.path],
    //             loader: args.path.endsWith('.ts') ? 'ts' : 'js',
    //           }
    //         })
    //       },
    //     },
    //   ],
    // })

    // const bundledCode = result.outputFiles[0].text