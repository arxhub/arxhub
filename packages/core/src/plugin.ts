import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Named } from '@arxhub/stdlib/collections/named'
import type { Constructor, Except } from 'type-fest'
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

export type PluginArgs = {
  logger: Logger
}

export abstract class Plugin<T> implements Named {
  protected readonly logger: Logger
  readonly manifest: PluginManifest

  constructor({ logger }: PluginArgs, manifest: PluginManifest) {
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
  private readonly defaults: PluginArgs

  constructor(defaults: PluginArgs) {
    super('Plugin')
    this.defaults = defaults
  }

  // TODO: waiting for biome 2.0 https://github.com/biomejs/biome/discussions/187
  // biome-ignore format: Hand formatting is more readable
  override register(factory: Constructor<Plugin<T>, [PluginArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends PluginArgs>(factory: Constructor<Plugin<T>, [A]>, args: () => Except<A, keyof PluginArgs>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends PluginArgs>(factory: Constructor<Plugin<T>, [PluginArgs] | [A]>, args?: () => Except<A, keyof PluginArgs>): void {
    super.register(factory, args == null ? () => [this.defaults] : () => [{ ...this.defaults, ...args() }])
  }
}
