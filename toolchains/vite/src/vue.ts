import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { type ConfigEnv, type UserConfig, mergeConfig } from 'vite'
import { createGenericConfig } from './generic'

export interface VueConfigOptions {
  /** Set to false for SPA apps (no lib output). Defaults to true for library builds. */
  lib?: boolean
  /** Additional packages to mark as external (vue is always external). */
  external?: string[]
  /** Entry points for the lib build. Defaults to ['src/index.ts']. */
  entries?: string[]
}

export function createVueConfig(dirname: string, env: ConfigEnv, options: VueConfigOptions = {}): UserConfig {
  const { lib = true, external = [], entries = [] } = options

  const resolvedEntries = entries.length === 0
    ? [resolve(dirname, 'src/index.ts')]
    : entries.map((e) => resolve(dirname, e))

  const libConfig: UserConfig = lib
    ? {
        build: {
          minify: false,
          sourcemap: true,
          lib: {
            formats: ['es'],
            entry: resolvedEntries,
          },
          rollupOptions: {
            external: ['vue', '@ark-ui/vue', ...external],
            output: {
              preserveModules: true,
              preserveModulesRoot: `${dirname}/src`,
            },
          },
        },
      }
    : {}

  return mergeConfig(mergeConfig(createGenericConfig(dirname, env), libConfig), {
    plugins: [vue()],
  } satisfies UserConfig)
}
