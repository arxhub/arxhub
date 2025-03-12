import { resolve } from 'node:path'
import type { ConfigEnv, UserConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import type { UserConfig as UserTestConfig } from 'vitest/node'

export async function defineBaseConfig(dirname: string, env: ConfigEnv): Promise<UserConfig & UserTestConfig> {
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
    plugins: [tsconfigPaths()],
  }
}
