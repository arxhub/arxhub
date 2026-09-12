import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createVueConfig } from '@arxhub/toolchain-vite'
import { build } from 'vite'
import { expect, test } from 'vitest'

test('the production Icon bundle keeps its default icon pack', async () => {
  const outDir = await mkdtemp(resolve(tmpdir(), 'arxhub-icons-build-'))
  const root = resolve(import.meta.dirname, '../..')
  const entry = resolve(outDir, 'entry.ts')
  const config = createVueConfig(root, { command: 'build', mode: 'test' }, { lib: false })
  try {
    await writeFile(
      entry,
      `export { default as Icon } from ${JSON.stringify(resolve(root, 'src/core/Icon.vue'))};
       export { resolveIcon } from ${JSON.stringify(resolve(root, 'src/core/icons.ts'))};`,
    )
    await build({
      ...config,
      configFile: false,
      root,
      logLevel: 'silent',
      build: {
        outDir: resolve(outDir, 'dist'),
        lib: { entry, formats: ['es'], fileName: () => 'icons.mjs' },
        minify: true,
      },
    })
    const bundled = await import(/* @vite-ignore */ pathToFileURL(resolve(outDir, 'dist/icons.mjs')).href)
    for (const name of ['lu:folder-open', 'lu:refresh-cw', 'lu:arrow-down-0-1']) {
      expect(bundled.resolveIcon(name).component, name).toBeDefined()
      expect(bundled.resolveIcon(name).glyph, name).toBeUndefined()
    }
    expect(bundled.resolveIcon('custom glyph')).toEqual({ glyph: 'custom glyph' })
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}, 30_000)
