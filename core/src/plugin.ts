import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Named } from '@arxhub/stdlib/collections/named'
import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'

export interface PluginManifest {
  name: string
  version: string
  description?: string
  author: string
  minApi?: string
}

export abstract class Plugin<T> implements Named {
  readonly manifest: PluginManifest

  constructor(manifest: PluginManifest) {
    this.manifest = manifest
  }

  get name(): string {
    return this.manifest.name
  }

  create(target: T): void {}

  configure(target: T): void {}

  start(target: T): Promise<void> {
    return Promise.resolve()
  }

  stop(target: T): Promise<void> {
    return Promise.resolve()
  }
}

export class PluginContainer<T> extends LazyContainer<Plugin<T>> {
  private readonly target: T

  constructor(target: T, plugins: NamedFactory<Plugin<T>>[] = []) {
    super('Plugin', plugins)
    this.target = target
  }
}
