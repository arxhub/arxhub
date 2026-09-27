import { defineConfig } from 'vitest/config'

// The instance's own vite config builds or serves the whole app (the dev stand starts its server from a
// plugin hook); a unit test of the instance's catalog needs none of that.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
