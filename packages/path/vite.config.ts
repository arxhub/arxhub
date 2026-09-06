import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// Both arms of the dual export are entries: the package resolves to index.node.ts under node and
// index.ts everywhere else, so a build that emitted only one of them would ship a broken condition.
export default defineConfig((env) => createNodeConfig(__dirname, env, ['src/index.ts', 'src/index.node.ts']))
