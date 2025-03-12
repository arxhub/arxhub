import { resolve } from 'node:path'
import { type ConfigEnv, type UserConfig, mergeConfig } from 'vite'

export async function defineBaseConfig(dirname: string, env: ConfigEnv): Promise<UserConfig> {
  return mergeConfig(defineBaseConfig(dirname, env), {
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
        external: ['.*__generated__.*', '.*__tests__.*'],
        plugins: [
          nodeExternals({
            deps: true,
            peerDeps: true,
            devDeps: true,
            optDeps: true,
            packagePath: internalPackages.map((it) => it.path),
            exclude: internalPackages.map((it) => new RegExp(`^${it.name}.*`)),
          }),
        ],
      },
    },
    resolve: {
      mainFields: ['module', 'jsnext:main', 'jsnext'],
      conditions: ['node'],
    },
    plugins: [
      dts({
        exclude: [resolve(dirname, 'src', '__tests__', '**')],
        entryRoot: resolve(dirname, 'src'),
      }),
    ],
  } satisfies UserConfig)
}
