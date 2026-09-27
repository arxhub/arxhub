import { resolve } from 'node:path'
import { createBrowserConfig } from '@arxhub/toolchain-vite'
import { defineConfig, mergeConfig } from 'vite'

export default defineConfig((env) =>
  mergeConfig(createBrowserConfig(__dirname, env), {
    build: {
      lib: {
        formats: ['es'],
        entry: [resolve(__dirname, 'src/index.ts'), resolve(__dirname, 'src/testing/index.ts')],
      },
      rollupOptions: {
        external: ['vue', '@arxhub/errors', '@arxhub/events'],
        output: {
          preserveModules: true,
          preserveModulesRoot: `${__dirname}/src`,
        },
      },
    },
  }),
)
