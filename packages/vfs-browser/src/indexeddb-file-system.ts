import {
  type DeleteOptions,
  type FileFields,
  type FileMetadata,
  FileNotFound,
  GenericFile,
  type VirtualFile,
  type VirtualFileSystem,
} from '@arxhub/vfs'

const DB_NAME = 'arxhub-vfs'
const STORE_NAME = 'files'
const DB_VERSION = 2

interface FileRecord {
  pathname: string
  content: ArrayBuffer
  fields: FileFields
  metadata: FileMetadata
}

export class IndexedDBFileSystem implements VirtualFileSystem {
  private readonly prefix: string
  private db: IDBDatabase | null = null

  constructor(prefix: string = '') {
    this.prefix = prefix
  }

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'pathname' })
          store.createIndex('prefix', 'pathname', { multiEntry: false })
        }
      }
    })
  }

  private key(pathname: string): string {
    return this.prefix ? `${this.prefix}/${pathname}` : pathname
  }

  async *list(prefix: string = ''): AsyncGenerator<VirtualFile> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()

    const prefixWithSlash = prefix ? `${this.key(prefix)}/` : this.prefix ? `${this.prefix}/` : ''
    const files: VirtualFile[] = []

    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const record = cursor.value as FileRecord
          if (prefixWithSlash === '' || record.pathname.startsWith(prefixWithSlash)) {
            const pathname = record.pathname.replace(this.prefix ? `${this.prefix}/` : '', '')
            files.push(new GenericFile(this, pathname))
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
    })

    for (const file of files) {
      yield file
    }
  }

  file(filename: string): VirtualFile {
    return new GenericFile(this, filename)
  }

  async read(filename: string): Promise<Buffer> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(this.key(filename))

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const record = request.result as FileRecord | undefined
        if (!record) {
          reject(new FileNotFound(filename))
          return
        }
        resolve(Buffer.from(record.content))
      }
    })
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
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const now = Date.now()

    // Try to get existing record to preserve fields/metadata
    const getRequest = store.get(this.key(filename))

    return new Promise((resolve, reject) => {
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const existing = getRequest.result as FileRecord | undefined

        const sliced = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
        const record: FileRecord = {
          pathname: this.key(filename),
          content: sliced,
          fields: existing?.fields ?? {},
          metadata: {
            hash: '',
            createdAt: existing?.metadata?.createdAt ?? now,
            updatedAt: now,
            size: content.byteLength,
          },
        }

        const putRequest = store.put(record)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve()
      }
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

  async delete(filename: string): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.delete(this.key(filename))
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async head(filename: string): Promise<unknown> {
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(this.key(filename))

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const record = request.result as FileRecord | undefined
        if (!record) {
          reject(new FileNotFound(filename))
          return
        }
        resolve({
          pathname: record.pathname,
          fields: record.fields,
          metadata: record.metadata,
        })
      }
    })
  }

  async isExists(filename: string): Promise<boolean> {
    try {
      await this.head(filename)
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
    const db = await this.openDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const key = this.key(filename)
    const getRequest = store.get(key)

    return new Promise((resolve, reject) => {
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        const existing = getRequest.result as FileRecord | undefined

        if (!existing) {
          reject(new FileNotFound(filename))
          return
        }

        const record: FileRecord = {
          ...existing,
          fields,
          metadata: {
            ...metadata,
            updatedAt: Date.now(),
          },
        }

        const putRequest = store.put(record)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve()
      }
    })
  }
}
