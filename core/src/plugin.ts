import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Named } from '@arxhub/stdlib/collections/named'
import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'
import type { Logger } from './logger'

export interface PluginManifest {
  name: string
  version: string
  description?: string
  author: string
  minApi?: string
}

export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return manifest
}

export interface PluginArgs {
  logger: Logger
}

export abstract class Plugin<T> implements Named {
  protected readonly logger: Logger

  constructor(args: PluginArgs) {
    this.logger = args.logger.child(`[${this.name}] -`)
  }

  abstract get manifest(): PluginManifest

  get name(): string {
    return this.constructor.name
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

export class PluginContainer<T> extends LazyContainer<Plugin<T>, [PluginArgs]> {
  constructor(plugins: NamedFactory<Plugin<T>>[] = []) {
    super('Plugin', plugins)
  }
}
