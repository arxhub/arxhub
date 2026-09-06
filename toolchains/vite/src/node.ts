import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname as parentOf, resolve } from 'node:path'
import { type ConfigEnv, mergeConfig, type UserConfig } from 'vite'
import { createGenericConfig } from './generic'

// Every dependency stays out of the bundle: a library build ships its imports rather than inlining
// them, and each package here is built on its own.
//
// Read from the package.json instead of through rollup-plugin-node-externals, which did the same job
// until 9.0.0 started calling `RegExp.escape` — that exists only from Node 24, so on anything older it
// failed as `undefined is not a function` inside the plugin and took down the build of every package
// in the repo, tests included. A dependency that pins the whole monorepo's build to a Node version is
// a poor trade for the twenty lines below.
function externalPackages(dirname: string): string[] {
  const names = new Set<string>()
  let dir = dirname

  for (;;) {
    const manifest = resolve(dir, 'package.json')
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, Record<string, string> | undefined>
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const name of Object.keys(json[field] ?? {})) names.add(name)
      }
    }

    // The workspace root ends the walk — above it are directories with nothing to do with this build.
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) break
    const up = parentOf(dir)
    if (up === dir) break
    dir = up
  }

  return [...names]
}

function isExternal(packages: readonly string[], id: string): boolean {
  if (id.startsWith('node:')) return true
  if (builtinModules.includes(id)) return true
  // A subpath import (`@arxhub/uikit/core`) belongs to its package and is external with it.
  return packages.some((name) => id === name || id.startsWith(`${name}/`))
}

export function createNodeConfig(dirname: string, env: ConfigEnv, entries: string[] = []): UserConfig {
  const entryPaths = entries.length === 0 ? [resolve(dirname, 'src/index.ts')] : entries.map((entry) => resolve(dirname, entry))
  const packages = externalPackages(dirname)

  return mergeConfig(createGenericConfig(dirname, env), {
    build: {
      minify: false,
      sourcemap: true,
      lib: {
        formats: ['es'],
        entry: entryPaths,
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        treeshake: false,
        external: (id: string) => isExternal(packages, id),
        output: {
          preserveModules: true,
          preserveModulesRoot: `${dirname}/src`,
        },
      },
    },
    optimizeDeps: {
      include: ['@arxhub/plugin-gateway'],
      force: true,
    },
  } satisfies UserConfig)
}
