import type { VirtualFile } from '../virtual-file'
import type { VirtualFileSystem } from '../virtual-file-system'
import { deserializeCursor, serializeCursor, type VirtualWalker } from './interface'

export class VirtualWalkerImpl implements VirtualWalker {
  private readonly _vfs: VirtualFileSystem
  private _queue: string[]
  private _pending: string[]

  constructor(vfs: VirtualFileSystem, prefix: string, cursor?: string) {
    this._vfs = vfs
    if (cursor) {
      const state = deserializeCursor(cursor)
      this._queue = [...state.queue]
      this._pending = [...state.pending]
    } else {
      this._queue = [prefix]
      this._pending = []
    }
  }

  cursor(): string {
    return serializeCursor({ queue: this._queue, pending: this._pending })
  }

  async hasNext(): Promise<boolean> {
    while (this._pending.length === 0 && this._queue.length > 0) {
      const relDir = this._queue.shift()!
      const entries = await this._vfs.list(relDir)
      for (const entry of entries) {
        if (entry.kind === 'dir') this._queue.push(entry.pathname)
        else this._pending.push(entry.pathname)
      }
    }
    return this._pending.length > 0
  }

  async next(): Promise<VirtualFile | null> {
    if (!(await this.hasNext())) return null
    return this._vfs.file(this._pending.shift()!)
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<VirtualFile> {
    let file: VirtualFile | null
    while ((file = await this.next()) !== null) {
      yield file
    }
  }
}
