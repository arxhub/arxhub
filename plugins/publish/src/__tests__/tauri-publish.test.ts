import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { VfsSyncRemote } from '@arxhub/sync'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { BaseDirectory, TauriFileSystem } from '@arxhub/vfs-tauri'
import Elysia from 'elysia'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { PublishManifest } from '../publish-manifest'
import { Publisher } from '../publisher'
import { publicReadRoutes } from '../server/public-read-routes'

const native = vi.hoisted(() => ({ root: '' }))

// Only the IPC boundary is replaced. Real OS calls retain ENOTDIR and missing-file behaviour.
vi.mock('@tauri-apps/plugin-fs', async () => {
  const fs = await import('node:fs/promises')
  const { join } = await import('node:path')
  return {
    BaseDirectory: { AppData: 1 },
    exists: async (path: string) => {
      try {
        await fs.access(join(native.root, path))
        return true
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false
        throw error
      }
    },
    stat: async (path: string) => {
      const info = await fs.stat(join(native.root, path))
      return { isFile: info.isFile(), isDirectory: info.isDirectory(), size: info.size, mtime: info.mtime, birthtime: info.birthtime }
    },
    readDir: async (path: string) =>
      (await fs.readdir(join(native.root, path), { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      })),
    readFile: (path: string) => fs.readFile(join(native.root, path)),
    writeFile: (path: string, content: Uint8Array) => fs.writeFile(join(native.root, path), content),
    mkdir: (path: string, options: { recursive: boolean }) => fs.mkdir(join(native.root, path), options),
    remove: (path: string, options: { recursive: boolean }) => fs.rm(join(native.root, path), options),
  }
})

beforeEach(async () => {
  native.root = await mkdtemp(join(tmpdir(), 'arxhub-tauri-publish-'))
})
afterEach(async () => {
  await rm(native.root, { recursive: true, force: true })
})

test.each(['folder/note.arx', 'folder'])('publishes %s from Tauri through sync chunks and renders the assembled content', async (root) => {
  const logger = new ConsoleLogger()
  const vault = new TauriFileSystem('vault', BaseDirectory.AppData, logger)
  const storage = new TauriFileSystem('storage', BaseDirectory.AppData, logger)
  const publicVfs = new NodeFileSystem(join(native.root, 'public'), logger)
  const remote = new VfsSyncRemote(publicVfs)
  const publisher = new Publisher({ vault, storage, remote, logger })
  await publisher.load()
  await vault
    .file('existing.arx')
    .writeJSON({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing' }] }] } })
  await publisher.publish('existing.arx')
  const attachment = new Uint8Array(8 * 1024 * 1024 + 41).fill(0x5a)
  await vault.file('attachments/sample.bin').write(attachment)
  const raw = JSON.stringify({
    version: 1,
    doc: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Native publication' }] },
        { type: 'attachment', attrs: { path: 'attachments/sample.bin', name: 'sample.bin' } },
      ],
    },
  })
  await vault.file('folder/note.arx').writeText(raw)
  await publisher.publish(root)
  const app = new Elysia().use(publicReadRoutes(publicVfs)).compile()
  const get = (path: string) => app.handle(new Request(`http://localhost/public/${path}`))
  const manifest = (await (await get('~manifest')).json()) as PublishManifest
  expect(manifest.files['attachments/sample.bin'].chunks.length).toBeGreaterThan(1)
  expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(['existing.arx', 'folder/note.arx', 'attachments/sample.bin']))
  expect(Object.keys(manifest.files).some((path) => path.endsWith('.arxmeta'))).toBe(false)
  expect(await (await get('folder/note.arx?source=1')).text()).toBe(raw)
  expect(await (await get('folder/note.arx')).text()).toContain('<h1>Native publication</h1>')
  expect(Buffer.from(await (await get('attachments/sample.bin')).arrayBuffer()).equals(Buffer.from(attachment))).toBe(true)
  await publisher.unpublish(root)
  expect((await get('folder/note.arx')).status).toBe(404)
  expect((await get('attachments/sample.bin')).status).toBe(404)
  expect((await get('existing.arx')).status).toBe(200)
})
