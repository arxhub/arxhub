import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { ReadonlyDeep } from 'type-fest'
import type { DeleteOptions } from './types/delete-options'
import type { FileFields } from './types/file-fields'
import type { FileMetadata } from './types/file-metadata'
import type { FileMutations, VirtualFile } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export class GenericFile implements VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly pathname: string

  readonly path: string

  readonly name: string

  readonly extension: string

  private _fields: FileFields = {}

  private _metadata: FileMetadata = {
    hash: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    size: 0,
  }

  private _dirty = false

  constructor(vfs: VirtualFileSystem, pathname: string) {
    this.vfs = vfs

    this.pathname = pathname
    const splitted = splitPathname(pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext
  }

  get fields(): ReadonlyDeep<FileFields> {
    return this._fields as ReadonlyDeep<FileFields>
  }

  get metadata(): ReadonlyDeep<FileMetadata> {
    return this._metadata as ReadonlyDeep<FileMetadata>
  }

  readonly mutate: FileMutations = {
    setField: <K extends keyof FileFields>(key: K, value: FileFields[K]) => {
      this._fields[key] = value
      this._dirty = true
    },

    setFields: (fields: Partial<FileFields>) => {
      Object.assign(this._fields, fields)
      this._dirty = true
    },

    setMetadata: <K extends keyof FileMetadata>(key: K, value: FileMetadata[K]) => {
      this._metadata[key] = value
      this._dirty = true
    },

    batch: (changes: { fields?: Partial<FileFields>; metadata?: Partial<FileMetadata> }) => {
      if (changes.fields) {
        Object.assign(this._fields, changes.fields)
      }
      if (changes.metadata) {
        Object.assign(this._metadata, changes.metadata)
      }
      this._dirty = true
    },
  }

  async load(): Promise<void> {
    const head = await this.head()
    if (head && typeof head === 'object') {
      const record = head as Record<string, unknown>
      this._fields = (record.fields as FileFields) ?? {}
      this._metadata = (record.metadata as FileMetadata) ?? {
        hash: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: 0,
      }
    }
    this._dirty = false
  }

  async flush(): Promise<void> {
    if (!this._dirty) return

    if ('saveFieldsAndMetadata' in this.vfs) {
      await (
        this.vfs as unknown as { saveFieldsAndMetadata(filename: string, fields: FileFields, metadata: FileMetadata): Promise<void> }
      ).saveFieldsAndMetadata(this.pathname, this._fields, this._metadata)
    }

    this._dirty = false
  }

  isDirty(): boolean {
    return this._dirty
  }

  read(): Promise<Buffer> {
    return this.vfs.read(this.pathname)
  }

  async readText(): Promise<string> {
    const buffer = await this.read()
    return buffer.toString('utf-8')
  }

  async readJSON<T>(defaultValue?: T): Promise<T> {
    if (defaultValue != null && !(await this.isExists())) {
      return defaultValue
    }

    const text = await this.readText()
    return JSON.parse(text) as T
  }

  readable(): Promise<ReadableStream<Uint8Array>> {
    return this.vfs.readableStream(this.pathname)
  }

  async write(content: Buffer): Promise<void> {
    await this.vfs.write(this.pathname, content)
  }

  writeText(content: string): Promise<void> {
    return this.write(Buffer.from(content, 'utf-8'))
  }

  writeJSON<T>(content: T): Promise<void> {
    const json = JSON.stringify(content, null, 2)
    return this.writeText(json)
  }

  writable(): Promise<WritableStream<Uint8Array>> {
    return this.vfs.writableStream(this.pathname)
  }

  delete(options?: DeleteOptions): Promise<void> {
    return this.vfs.delete(this.pathname, options)
  }

  isExists(): Promise<boolean> {
    return this.vfs.isExists(this.pathname)
  }

  hash(algorithm: string): Promise<string> {
    return this.vfs.hash(this.pathname, algorithm)
  }

  head(): Promise<unknown> {
    return this.vfs.head(this.pathname)
  }
}
