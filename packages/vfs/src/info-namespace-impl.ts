import type { Get, PartialDeep, Paths } from 'type-fest'
import type { BaseInfoFields, InfoFlushOptions, InfoNamespace } from './info-namespace'
import type { VirtualFile } from './virtual-file'

export class InfoNamespaceImpl<T extends Record<string, unknown> = BaseInfoFields> implements InfoNamespace<T> {
  private readonly file: VirtualFile<T>
  private _cache: T | null = null
  private _dirty = false

  constructor(file: VirtualFile<T>) {
    this.file = file
  }

  private async load(): Promise<T> {
    if (this._cache !== null) return this._cache
    try {
      const raw = await this.file.vfs.read(`${this.file.pathname}.info`)
      this._cache = JSON.parse(new TextDecoder().decode(raw)) as T
    } catch {
      this._cache = {} as T
    }
    return this._cache
  }

  async get<K extends Paths<T>>(key: K): Promise<Get<T, K>> {
    const data = await this.load()
    return (data as Record<string, unknown>)[key as string] as Get<T, K>
  }

  async getAll(): Promise<Readonly<T>> {
    return this.load()
  }

  async set(keyOrFields: Paths<T> | PartialDeep<T>, valueOrOptions?: unknown, options?: InfoFlushOptions): Promise<void> {
    const data = await this.load()

    if (typeof keyOrFields === 'string') {
      ;(data as Record<string, unknown>)[keyOrFields] = valueOrOptions
      this._dirty = true
      if (options?.flush ?? true) await this.flush()
    } else {
      Object.assign(data as object, keyOrFields)
      this._dirty = true
      if ((valueOrOptions as InfoFlushOptions | undefined)?.flush ?? true) await this.flush()
    }
  }

  isDirty(): boolean {
    return this._dirty
  }

  async flush(): Promise<void> {
    if (!this._dirty || this._cache === null) return
    const data = this._cache
    const infoPathname = `${this.file.pathname}.info`
    await this.file.vfs.lock(infoPathname, async () => {
      await this.file.vfs.write(infoPathname, new TextEncoder().encode(JSON.stringify(data)))
    })
    this._dirty = false
  }
}
