import crypto from 'node:crypto'
import { LocalFileSystem, type VirtualFile, type VirtualFileSystem } from '@arxhub/vfs'
import dayjs from 'dayjs'
import { gunzipSync } from 'fflate'
import { describe, test } from 'vitest'
import { Chunker } from '../chunker'

describe('chunker', async () => {
  const chunker = new Chunker()
  const vfs: VirtualFileSystem = new LocalFileSystem(`${__dirname}/testdata`)
  const bytes: VirtualFile = await vfs.file('bytes')

  async function unpackBytes() {
    const exists = await bytes.isExists()
    if (!exists) {
      const gzip = await vfs.readFile('10MB.gzip')
      await bytes.write(gunzipSync(gzip))
    }
  }

  async function deleteChunks() {
    await vfs.deleteFile('chunks', { recursive: true })
  }

  async function deleteMerged() {
    await vfs.deleteFile('merged')
  }

  test('split', async () => {
    await unpackBytes()
    await deleteChunks()

    for await (const chunk of chunker.split(bytes)) {
      const file = await vfs.file(`/chunks/${dayjs().unix}`)
      await file.write(Buffer.from(chunk))
    }
  })

  test('merge', async () => {
    await unpackBytes()
    await deleteMerged()

    const chunks = await Array.fromAsync(vfs.listFiles('chunks'))
    const file = await vfs.file('merged')
    const writable = await file.writable()
    const merged = await chunker.merge(chunks)
    merged.pipeTo(writable)
  })
})
