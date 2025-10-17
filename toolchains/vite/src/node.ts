import { resolve } from 'node:path'
import nodeExternalsPlugin from 'rollup-plugin-node-externals'
import { type ConfigEnv, type UserConfig, mergeConfig } from 'vite'
import { createGenericConfig } from './generic'

export function createNodeConfig(dirname: string, env: ConfigEnv, entries: string[] = []): UserConfig {
  // biome-ignore lint/style/noParameterAssign: Workaround for default value
  entries = entries.length === 0 ? [resolve(dirname, 'src/index.ts')] : entries.map((entry) => resolve(dirname, entry))

  return mergeConfig(createGenericConfig(dirname, env), {
    build: {
      minify: false,
      sourcemap: true,
      lib: {
        formats: ['es'],
        entry: entries,
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        treeshake: false,
        output: {
          preserveModules: true,
          preserveModulesRoot: `${dirname}/src`,
        },
      },
    },
    optimizeDeps: {
      include: [
        '@arxhub/plugin-gateway',
      ],
      force: true,
    },
    plugins: [
      nodeExternalsPlugin({
        builtinsPrefix: 'add',
        devDeps: true,
      }),
    ],
  } satisfies UserConfig)
}
