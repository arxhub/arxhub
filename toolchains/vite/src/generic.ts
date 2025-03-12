import { resolve } from 'node:path'
import type { ConfigEnv, UserConfig } from 'vite'
import dtsPlugin from 'vite-plugin-dts'
import tsconfigPathsPlugin from 'vite-tsconfig-paths'
import type { UserConfig as UserTestConfig } from 'vitest/node'

export function createGenericConfig(dirname: string, env: ConfigEnv): UserConfig & UserTestConfig {
  return {
    build: {
      outDir: 'dist',
      target: 'esnext',
    },
    test: {
      watch: false,
      include: [resolve(dirname, 'src', '**', '*.test.ts?(x)'), resolve(dirname, 'src', '**', '*.spec.ts?(x)')],
      sequence: {
        hooks: 'stack',
      },
    },
    plugins: [tsconfigPathsPlugin(), env.mode !== 'production' ? undefined : dtsPlugin()],
  }
}
