export type PluginMetadata = {
  id: string
  name: string
  version: string
  description: string
  author: string
  dependencies?: string[]
}

export interface Plugin<T> {
  readonly metadata: PluginMetadata

  apply(target: T): void
}
