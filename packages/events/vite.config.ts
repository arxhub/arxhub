import { createBrowserConfig } from '@arxhub/toolchain-vite'
import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vite'

export default defineConfig((env) =>
  mergeConfig(createBrowserConfig(__dirname, env), {
    build: {
      lib: {
        formats: ['es'],
        entry: resolve(__dirname, 'src/index.ts'),
      },
      rollupOptions: {
        external: ['eventemitter3'],
        output: {
          preserveModules: true,
          preserveModulesRoot: `${__dirname}/src`,
        },
      },
    },
  })
)
