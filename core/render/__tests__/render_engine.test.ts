import { afterEach, describe, it } from 'jsr:@std/testing/bdd'
import { createAssertSnapshot } from 'jsr:@std/testing/snapshot'
import { LocalFileSystem } from '~/core/vfs/local-file-system'
import { RenderEngine } from '~/core/render'
import { VentoMarkdownFileLoaderPlugin } from '~/core/render/plugins/vento_markdown_file_loader.ts'
import { MarkdownFileLoaderPlugin } from '~/core/render/plugins/markdown_file_loader.ts'
import { VentoFileLoaderPlugin } from '~/core/render/plugins/vento_file_loader.ts'
import { FallbackFileLoaderPlugin } from '~/core/render/plugins/fallback_file_loader.ts'

const assertSnapshot = createAssertSnapshot({
  dir: `${import.meta.dirname}/snapshots`,
})

describe('render engine', () => {
  const vfs = new LocalFileSystem('local', `${import.meta.dirname}/wikidata`)
  const engine = new RenderEngine(vfs, [
    new VentoMarkdownFileLoaderPlugin(),
    new MarkdownFileLoaderPlugin(),
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

  it('vento', async (t) => {
    const file = await vfs.file('vento.vto')
    const content = await engine.render(file, { mode: 'static', data: { foo: 'foo', bar: 'bar' } })
    await assertSnapshot(t, content)
  })

  it('markdown', async (t) => {
    const file = await vfs.file('markdown.md')
    const content = await engine.render(file, { mode: 'static', data: { foo: 'foo', bar: 'bar' } })
    await assertSnapshot(t, content)
  })

  it('vento and markdown', async (t) => {
    const file = await vfs.file('vento_and_markdown.vtd')
    const content = await engine.render(file, { mode: 'static', data: { foo: 'foo', bar: 'bar' } })
    await assertSnapshot(t, content)
  })

  it('include works', async (t) => {
    const file = await vfs.file('include.vto')
    const content = await engine.render(file, { mode: 'static', data: { foo: 'foo', bar: 'bar' } })
    await assertSnapshot(t, content)
  })
})
