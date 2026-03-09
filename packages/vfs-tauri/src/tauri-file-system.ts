import {
  type DeleteOptions,
  type FileFields,
  type FileMetadata,
  FileNotFound,
  GenericFile,
  type VirtualFile,
  type VirtualFileSystem,
} from '@arxhub/vfs'
import { BaseDirectory, exists, readDir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'

export class TauriFileSystem implements VirtualFileSystem {
  private readonly baseDir: BaseDirectory
  private readonly basePath: string

  constructor(basePath: string = '', baseDir: BaseDirectory = BaseDirectory.AppData) {
    this.basePath = basePath
    this.baseDir = baseDir
  }

  private fullPath(pathname: string): string {
    return this.basePath ? `${this.basePath}/${pathname}` : pathname
  }

  private relativePath(fullPath: string): string {
    return this.basePath ? fullPath.replace(`${this.basePath}/`, '') : fullPath
  }

  private metaPath(pathname: string): string {
    return `${this.fullPath(pathname)}.arxhub-meta.json`
  }

  async *list(prefix: string = ''): AsyncGenerator<VirtualFile> {
    const fullPrefix = this.fullPath(prefix)

    async function* walk(dirPath: string, basePath: string): AsyncGenerator<string> {
      try {
        const entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData })
        for (const entry of entries) {
          if (entry.name.endsWith('.arxhub-meta.json')) {
            continue
          }
          const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name
          if (entry.isDirectory) {
            yield* walk(entryPath, basePath)
          } else {
            yield entryPath
          }
        }
      } catch {}
    }

    for await (const filePath of walk(fullPrefix, this.basePath)) {
      yield new GenericFile(this, this.relativePath(filePath))
    }
  }

  file(filename: string): VirtualFile {
    return new GenericFile(this, filename)
  }

  async read(filename: string): Promise<Buffer> {
    try {
      const content = await readFile(this.fullPath(filename), { baseDir: this.baseDir })
      return Buffer.from(content)
    } catch {
      throw new FileNotFound(filename)
    }
  }

  async readableStream(filename: string): Promise<ReadableStream> {
    const content = await this.read(filename)
    return new ReadableStream({
      start(controller) {
        controller.enqueue(content)
        controller.close()
      },
    })
  }

  async write(filename: string, content: Buffer): Promise<void> {
    const path = this.fullPath(filename)

    await writeFile(path, content, { baseDir: this.baseDir })

    const now = Date.now()

    const meta = await this.loadMeta(filename)

    await this.saveMeta(filename, meta.fields, {
      ...meta.metadata,
      createdAt: meta.metadata?.createdAt ?? now,
      updatedAt: now,
      size: content.byteLength,
    })
  }

  async writableStream(filename: string): Promise<WritableStream> {
    const chunks: Uint8Array[] = []

    return new WritableStream({
      write: (chunk) => {
        chunks.push(chunk)
      },
      close: async () => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const combined = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of chunks) {
          combined.set(chunk, offset)
          offset += chunk.length
        }
        await this.write(filename, Buffer.from(combined))
      },
    })
  }

  async delete(filename: string, options?: DeleteOptions): Promise<void> {
    try {
      await remove(this.fullPath(filename), {
        baseDir: this.baseDir,
        recursive: options?.recursive ?? false,
      })
      try {
        await remove(this.metaPath(filename), {
          baseDir: this.baseDir,
          recursive: false,
        })
      } catch {}
    } catch {
      if (!options?.force) {
        throw new FileNotFound(filename)
      }
    }
  }

  async head(filename: string): Promise<unknown> {
    const content = await this.read(filename)
    const meta = await this.loadMeta(filename)

    return {
      fields: meta.fields ?? {},
      metadata: {
        ...meta.metadata,
        size: content.byteLength,
      },
    }
  }

  async isExists(filename: string): Promise<boolean> {
    try {
      await this.read(filename)
      return true
    } catch {
      return false
    }
  }

  async hash(filename: string, algorithm: string): Promise<string> {
    const content = await this.read(filename)
    const crypto = globalThis.crypto
    const arrayBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
    const hashBuffer = await crypto.subtle.digest(algorithm, arrayBuffer)
    const hashArray = new Uint8Array(hashBuffer)
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async saveFieldsAndMetadata(filename: string, fields: FileFields, metadata: FileMetadata): Promise<void> {
    await this.saveMeta(filename, fields, metadata)
  }

  private async loadMeta(filename: string): Promise<{ fields: FileFields; metadata: Partial<FileMetadata> }> {
    const metaPath = this.metaPath(filename)

    try {
      const content = await readFile(metaPath, { baseDir: this.baseDir })
      const json = JSON.parse(Buffer.from(content).toString('utf-8'))
      return {
        fields: json.fields ?? {},
        metadata: json.metadata ?? {},
      }
    } catch {
      return {
        fields: {},
        metadata: {},
      }
    }
  }

  private async saveMeta(filename: string, fields: FileFields, metadata: Partial<FileMetadata>): Promise<void> {
    const metaPath = this.metaPath(filename)
    const metaContent = JSON.stringify({ fields, metadata }, null, 2)

    await writeFile(metaPath, Buffer.from(metaContent, 'utf-8'), { baseDir: this.baseDir })
  }
}
