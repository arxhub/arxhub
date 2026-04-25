import type { Get, PartialDeep, Paths } from 'type-fest'

export interface BaseInfoFields {
  hash?: string
  [key: string]: unknown
}

export interface InfoFlushOptions {
  flush?: boolean
}

export interface InfoNamespace<T extends Record<string, unknown> = BaseInfoFields> {
  get<K extends Paths<T>>(key: K): Promise<Get<T, K>>
  getAll(): Promise<Readonly<T>>
  set<K extends Paths<T>>(key: K, value: Get<T, K>, options?: InfoFlushOptions): Promise<void>
  set(fields: PartialDeep<T>, options?: InfoFlushOptions): Promise<void>
  isDirty(): boolean
  flush(): Promise<void>
}
