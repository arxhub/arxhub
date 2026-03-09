import crypto from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { listFiles } from '@arxhub/stdlib/fs/list-files'
import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { FileFields, FileMetadata } from '@arxhub/vfs'
import { type DeleteOptions, GenericFile, type VirtualFile, type VirtualFileSystem } from '@arxhub/vfs'

interface NodeFileRecord {
  fields: FileFields
  metadata: FileMetadata
}

export class NodeFileSystem implements VirtualFileSystem {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }

  private metaPath(filename: string): string {
    return join(this.rootDir, `${filename}.arxhub-meta.json`)
  }

  async *list(prefix: string = ''): AsyncGenerator<VirtualFile> {
    for await (const realPathname of listFiles(join(this.rootDir, prefix))) {
      if (realPathname.endsWith('.arxhub-meta.json')) {
        continue
      }
      const pathname = realPathname.replace(`${this.rootDir}/`, '')
      const file = new GenericFile(this, pathname)
      await file.load()
      yield file
    }
  }

  file(filename: string): VirtualFile {
    return new GenericFile(this, filename)
  }

  async read(filename: string): Promise<Buffer> {
    return fs.readFile(join(this.rootDir, filename))
  }

  async readableStream(filename: string): Promise<ReadableStream> {
    return Readable.toWeb(createReadStream(join(this.rootDir, filename))) as ReadableStream
  }

  async write(filename: string, content: Buffer): Promise<void> {
    const path = join(this.rootDir, filename)
    await fs.mkdir(splitPathname(path).path, { recursive: true })
    await fs.writeFile(path, content)

    const metaPath = this.metaPath(filename)
    const meta: NodeFileRecord = {
      fields: {},
      metadata: {
        hash: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: content.length,
      },
    }
    await fs.writeFile(metaPath, JSON.stringify(meta))
  }

  async writableStream(filename: string): Promise<WritableStream> {
    const path = join(this.rootDir, filename)
    await fs.mkdir(splitPathname(path).path, { recursive: true })
    return Writable.toWeb(createWriteStream(path))
  }

  async delete(filename: string, options?: DeleteOptions): Promise<void> {
    await fs.rm(join(this.rootDir, filename), options)
    try {
      await fs.rm(this.metaPath(filename))
    } catch {}
  }

  async head(filename: string): Promise<unknown> {
    const stats = await fs.stat(join(this.rootDir, filename))
    let fields: FileFields = {}
    let metadata: FileMetadata = {
      hash: '',
      createdAt: stats.birthtime.getTime(),
      updatedAt: stats.mtime.getTime(),
      size: stats.size,
    }

    try {
      const metaContent = await fs.readFile(this.metaPath(filename), 'utf-8')
      const meta = JSON.parse(metaContent) as NodeFileRecord
      fields = meta.fields ?? {}
      metadata = {
        ...metadata,
        ...meta.metadata,
      }
    } catch {}

    return { fields, metadata, stats }
  }

  async isExists(filename: string): Promise<boolean> {
    try {
      await fs.access(join(this.rootDir, filename))
      return true
    } catch {
      return false
    }
  }

  async hash(filename: string, algorithm: string): Promise<string> {
    const hash = crypto.createHash(algorithm)
    const stream = await this.readableStream(filename)
    const reader = stream.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return hash.digest('hex')
        hash.update(value)
      }
    } finally {
      reader.releaseLock()
      await stream.cancel()
    }
  }

  async saveFieldsAndMetadata(filename: string, fields: FileFields, metadata: FileMetadata): Promise<void> {
    const metaPath = this.metaPath(filename)
    const meta: NodeFileRecord = { fields, metadata }
    await fs.mkdir(splitPathname(metaPath).path, { recursive: true })
    await fs.writeFile(metaPath, JSON.stringify(meta))
  }
}
