import { resolve } from 'node:path'
import nodeExternalsPlugin from 'rollup-plugin-node-externals'
import { type ConfigEnv, type UserConfig, mergeConfig } from 'vite'
import { createGenericConfig } from './generic'

export function createNodeConfig(dirname: string, env: ConfigEnv): UserConfig {
  return mergeConfig(createGenericConfig(dirname, env), {
    build: {
      minify: false,
      sourcemap: true,
      lib: {
        formats: ['es'],
        entry: resolve(dirname, 'src/index'),
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
    plugins: [
      {
        enforce: 'pre',
        ...nodeExternalsPlugin({
          builtinsPrefix: 'add',
        }),
      },
    ],
  } satisfies UserConfig)
}
