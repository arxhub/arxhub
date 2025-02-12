import { afterEach, describe, it } from 'jsr:@std/testing/bdd'
import { createAssertSnapshot } from 'jsr:@std/testing/snapshot'
import { expect } from 'jsr:@std/expect'
import { RenderEngine } from '../render-engine.ts'
import { LocalFileSystem } from '../../../vfs/local-file-system/mod.ts'
import { FallbackFileLoaderPlugin } from '../plugins/fallback_file_loader_plugin.ts'
import { VentoFileLoaderPlugin } from '../plugins/vento_file_loader_plugin.ts'

const assertSnapshot = createAssertSnapshot({
  dir: `${import.meta.dirname}/snapshots`,
})

describe('render engine', () => {
  const vfs = new LocalFileSystem('local', `${import.meta.dirname}/wikidata`)
  const engine = new RenderEngine(vfs, [
    new VentoFileLoaderPlugin(),
    new FallbackFileLoaderPlugin(),
  ])

  afterEach(() => {
    engine.cache.clear()
  })

  it('fallback loader', async (t) => {
    const file = await vfs.file('fallback.ext')
    const content = await engine.render(file, { mode: 'static' })
    await assertSnapshot(t, content)
  })

  it('simple vento template', async (t) => {
    const file = await vfs.file('simple.vto')
    const content = await engine.render(file, { mode: 'static', data: { foo: 'foo', bar: 'bar' } })
    await assertSnapshot(t, content)
  })
})
