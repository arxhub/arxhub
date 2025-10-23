import crypto from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { listFiles } from '@arxhub/stdlib/fs/list-files'
import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import { GenericFile } from './generic-file'
import type { DeleteOptions } from './types/delete-options'
import type { VirtualFile } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export class LocalFileSystem implements VirtualFileSystem {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }

  async *list(prefix: string = ''): AsyncGenerator<VirtualFile> {
    for await (const realPathname of listFiles(join(this.rootDir, prefix))) {
      const pathname = realPathname.replace(`${this.rootDir}/`, '')
      yield new GenericFile(this, pathname)
    }
  }

  async file(filename: string): Promise<VirtualFile> {
    return new GenericFile(this, filename)
  }

  async read(filename: string): Promise<Buffer> {
    return fs.readFile(join(this.rootDir, filename))
  }

  async readableStream(filename: string): Promise<ReadableStream> {
    // See details here:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/65542
    return Readable.toWeb(createReadStream(join(this.rootDir, filename))) as ReadableStream
  }

  async write(filename: string, content: Buffer): Promise<void> {
    const path = join(this.rootDir, filename)

    await fs.mkdir(splitPathname(path).path, { recursive: true })
    return fs.writeFile(path, content)
  }

  async writableStream(filename: string): Promise<WritableStream> {
    const path = join(this.rootDir, filename)
    await fs.mkdir(splitPathname(path).path, { recursive: true })
    return Writable.toWeb(createWriteStream(path))
  }

  async delete(filename: string, options?: DeleteOptions): Promise<void> {
    return fs.rm(join(this.rootDir, filename), options)
  }

  async head(filename: string): Promise<unknown> {
    return fs.stat(join(this.rootDir, filename))
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
}
