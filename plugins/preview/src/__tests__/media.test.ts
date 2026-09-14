import type { VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { BLOB_LIMIT, extensionsOf, formatBytes, mediaOf, resolveMediaSource } from '../media'

describe('mediaOf', () => {
  test('recognises what a webview plays, case-insensitively', () => {
    expect(mediaOf('photos/Cat.JPG')).toEqual({ kind: 'image', mime: 'image/jpeg' })
    expect(mediaOf('talks/keynote.mp4')).toEqual({ kind: 'video', mime: 'video/mp4' })
    expect(mediaOf('voice/memo.m4a')).toEqual({ kind: 'audio', mime: 'audio/mp4' })
  })

  test('claims neither text nor containers no engine opens', () => {
    expect(mediaOf('diagram.svg')).toBeNull()
    expect(mediaOf('film.mkv')).toBeNull()
    expect(mediaOf('scan.pdf')).toBeNull()
    expect(mediaOf('LICENSE')).toBeNull()
  })

  test('every extension a viewer claims maps to exactly one kind', () => {
    const all = ['image', 'audio', 'video'].flatMap((kind) => extensionsOf(kind as 'image' | 'audio' | 'video'))
    expect(new Set(all).size).toBe(all.length)
    for (const ext of all) expect(ext.startsWith('.')).toBe(true)
  })
})

function fakeVfs(size: number, url: string | null, bytes = new Uint8Array([1, 2, 3])): VirtualFileSystem {
  const vfs = {
    head: async () => ({ size, modifiedAt: 0, createdAt: 0 }),
    read: async () => bytes,
    ...(url == null ? {} : { contentUrl: async () => url }),
  }
  return vfs as unknown as VirtualFileSystem
}

describe('resolveMediaSource', () => {
  test('a backend with a URL is streamed, whatever the size', async () => {
    const source = await resolveMediaSource(fakeVfs(BLOB_LIMIT * 10, 'asset://localhost/clip.mp4'), 'clip.mp4', 'video/mp4')
    expect(source).toEqual({ kind: 'url', url: 'asset://localhost/clip.mp4', size: BLOB_LIMIT * 10 })
  })

  test('without a URL the file is read whole, up to the limit', async () => {
    const source = await resolveMediaSource(fakeVfs(3, null), 'a.png', 'image/png')
    expect(source).toEqual({ kind: 'bytes', bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', size: 3 })
  })

  test('without a URL a file over the limit is refused rather than loaded', async () => {
    const source = await resolveMediaSource(fakeVfs(BLOB_LIMIT + 1, null), 'film.mp4', 'video/mp4')
    expect(source).toEqual({ kind: 'too-large', size: BLOB_LIMIT + 1 })
  })
})

describe('formatBytes', () => {
  test('reads as a human would say it', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})
