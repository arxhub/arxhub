export interface BaseInfoFields {
  hash?: string
  [key: string]: unknown
}

export interface InfoFlushOptions {
  flush?: boolean
}

export interface InfoNamespace<T extends Record<string, unknown> = BaseInfoFields> {
  get<K extends keyof T & string>(key: K): Promise<T[K]>
  getAll(): Promise<Readonly<T>>
  set<K extends keyof T & string>(key: K, value: T[K], options?: InfoFlushOptions): Promise<void>
  set(fields: Partial<T>, options?: InfoFlushOptions): Promise<void>
  isDirty(): boolean
  flush(): Promise<void>
}
