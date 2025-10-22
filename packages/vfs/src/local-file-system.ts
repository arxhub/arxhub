import fs from 'node:fs/promises'
import path from 'node:path'
import { isFileExists } from '@arxhub/stdlib/fs/is-file-exists'
import { listFiles } from '@arxhub/stdlib/fs/list-files'
import { readTextFile } from '@arxhub/stdlib/fs/read-text-file'
import { writeTextFile } from '@arxhub/stdlib/fs/write-text-file'
import { GenericFile, type GenericFileOptions } from './generic-file'
import type { VirtualFile } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export class LocalFileSystem implements VirtualFileSystem {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }
  getFileReadableStream(id: string): Promise<ReadableStream> {
    throw new Error('Method not implemented.')
  }
  getFileWritableStream(id: string): Promise<WritableStream> {
    throw new Error('Method not implemented.')
  }
  readFile(id: string): Promise<Buffer> {
    const absolute = path.join(this.rootDir, id)
    return fs.readFile(absolute)
  }
  async writeFile(id: string, content: Buffer): Promise<void> {
    const absolute = path.join(this.rootDir, id)
    const dirname = path.dirname(absolute)
    await fs.mkdir(dirname, { recursive: true })
    await fs.writeFile(absolute, content)
  }
  appendTextFile(id: string, content: string): Promise<void> {
    throw new Error('Method not implemented.')
  }
  isDirectory(id: string): Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  async file(pathname: string): Promise<VirtualFile> {
    const meta = await this.readMeta(pathname)
    return new GenericFile(this, { ...meta, pathname })
  }

  isEntryExists(pathname: string): Promise<boolean> {
    return isFileExists(`${this.rootDir}/${pathname}`)
  }

  // TODO: Add caching
  async *listFiles(): AsyncGenerator<VirtualFile> {
    for await (const realPathname of listFiles(this.rootDir)) {
      if (realPathname.endsWith('.meta')) continue
      const pathname = realPathname.replace(`${this.rootDir}/`, '')
      const meta = await this.readMeta(pathname)
      yield new GenericFile(this, { ...meta, pathname })
    }
  }

  readTextFile(pathname: string): Promise<string> {
    return readTextFile(`${this.rootDir}/${pathname}`)
  }

  writeTextFile(pathname: string, content: string): Promise<void> {
    return writeTextFile(`${this.rootDir}/${pathname}`, content)
  }

  refresh(): Promise<void> {
    // no-op for now
    // TODO: Add caching to listFiles
    return Promise.resolve()
  }

  private async readMeta(pathname: string): Promise<Omit<GenericFileOptions, 'pathname'>> {
    const meta: Omit<GenericFileOptions, 'pathname'> = {
      contentType: 'application/octet-stream',
      moduleType: 'unknown',
      fields: {},
      metadata: {},
    }

    // biome-ignore lint/style/noParameterAssign: Meta files should always be with a .meta extension
    if (!pathname.endsWith('.meta')) pathname = `${pathname}.meta`
    if (!(await this.isEntryExists(pathname))) {
      console.warn(`Meta file does not exists for: '${pathname}'`)
      return meta
    }

    try {
      return { ...meta, ...JSON.parse(await this.readTextFile(pathname)) }
    } catch (e) {
      console.error(`Error reading meta file: '${pathname}'`, e)
      return meta
    }
  }
}
