import { LocalFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { beforeAll, describe, expect, test } from 'vitest'
import { Chunker } from '../chunker'

describe('chunker', async () => {
  const chunker = new Chunker()
  const vfs: VirtualFileSystem = new LocalFileSystem(`${__dirname}/testdata`)
  const original = await vfs.file('original')

  beforeAll(async () => {
    const randomData = Buffer.alloc(10 * 1024 * 1024)
    for (let i = 0; i < randomData.length; i++) {
      randomData[i] = Math.floor(Math.random() * 256)
    }
    await original.write(randomData)
  })

  async function deleteChunks() {
    await vfs.delete('chunks', { force: true, recursive: true })
  }

  async function deleteMerged() {
    await vfs.delete('merged', { force: true })
  }

  test('split', async () => {
    await deleteChunks()

    let i = 0
    for await (const chunk of chunker.split(original)) {
      const file = await vfs.file(`/chunks/${i++}`)
      await file.write(Buffer.from(chunk))
    }
  })

  test('merge', async () => {
    await deleteMerged()

    const chunks = await Array.fromAsync(vfs.list('chunks'))
    const file = await vfs.file('merged')
    const writable = await file.writable()
    const merged = await chunker.merge(chunks)
    await merged.pipeTo(writable)

    expect(await original.hash('sha256')).toEqual(await file.hash('sha256'))
  })
})
