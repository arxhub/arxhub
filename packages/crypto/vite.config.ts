import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// Both arms of the dual export are entries — see packages/path. It was on createBrowserConfig, which
// adds nothing to the generic config, so vite fell back to an app build and looked for an index.html.
export default defineConfig((env) => createNodeConfig(__dirname, env, ['src/index.ts', 'src/index.node.ts']))
