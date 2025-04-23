import type { SearchableFileSystem } from '@arxhub/vfs'
import Elysia from 'elysia'
import { build } from 'esbuild'

export function createWebComponentsRouter(files: SearchableFileSystem) {
  return new Elysia().get('/scripts/web-components.js', async () => {
    const components = await files.find({ selector: { moduleType: 'web-component' } })

    const entryPointContent = components.map((file) => `import "${file.pathname}"`).join('\n')
    const virtualFiles: Record<string, string> = {
      'entry.ts': entryPointContent,
      ...Object.fromEntries(await Promise.all(components.map(async (file) => [file.pathname, await file.readText()]))),
    }

    const result = await build({
      entryPoints: ['entry.ts'],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      sourcemap: 'inline',
      plugins: [
        {
          name: 'virtual-files',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.path === 'entry.ts') {
                return { path: args.path, namespace: 'virtual' }
              }
              return { path: args.path }
            })
            build.onLoad({ filter: /.*/ }, (args) => {
              return {
                contents: virtualFiles[args.path],
                loader: args.path.endsWith('.ts') ? 'ts' : 'js',
              }
            })
          },
        },
      ],
    })

    const bundledCode = result.outputFiles[0].text

    return new Response(bundledCode, {
      headers: { 'Content-Type': 'application/javascript' },
    })
  })
}
