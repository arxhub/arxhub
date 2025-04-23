import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Named } from '@arxhub/stdlib/collections/named'
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

export abstract class Plugin<T> implements Named {
  protected readonly logger: Logger
  readonly manifest: PluginManifest

  constructor(logger: Logger, manifest: PluginManifest) {
    this.logger = logger.child(`[${this.name}] - `)
    this.manifest = manifest
  }

  get name(): string {
    return this.constructor.name
  }

  create(target: T): void {
    this.logger.info('Creating...')
  }

  configure(target: T): void {
    this.logger.info('Configuring...')
  }

  start(target: T): Promise<void> {
    this.logger.info('Starting...')
    return Promise.resolve()
  }

  stop(target: T): Promise<void> {
    this.logger.info('Stopping...')
    return Promise.resolve()
  }
}

export class PluginContainer<T> extends LazyContainer<Plugin<T>> {
  constructor() {
    super('Plugin')
  }
}
