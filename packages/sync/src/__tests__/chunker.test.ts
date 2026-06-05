import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeAll, describe, expect, test } from 'vitest'
import { Chunker } from '../chunker'

describe('chunker', async () => {
  const chunker = new Chunker()
  const vfs: VirtualFileSystem = new NodeFileSystem(`${__dirname}/testdata/chunker`, new ConsoleLogger())
  const original = vfs.file('original')

  beforeAll(async () => {
    await vfs.delete('./', { force: true, recursive: true })
    const randomData = Buffer.alloc(8 * 1024 * 1024)
    for (let i = 0; i < randomData.length; i++) {
      randomData[i] = Math.floor(Math.random() * 256)
    }
    await original.write(randomData)
  })

  test('split', async () => {
    let i = 0
    for await (const chunk of chunker.split(original)) {
      const file = vfs.file(`/chunks/${i++}`)
      await file.write(Buffer.from(chunk))
    }
  })

  test('merge', async () => {
    const chunks = []
    for (const chunk of await vfs.list('chunks')) chunks.push(chunk)
    const file = vfs.file('merged')
    const writable = await file.writable()
    const merged = chunker.merge(chunks)
    await merged.pipeTo(writable)

    expect(await original.info.get('hash')).toEqual(await file.info.get('hash'))
  })
})
