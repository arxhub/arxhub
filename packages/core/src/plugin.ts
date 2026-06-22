import { isConstructor, LazyContainer } from '@arxhub/di'
import type { Named } from '@arxhub/stdlib/collections/named'
import type { Constructor, Except } from 'type-fest'
import type { Logger } from './logger'
import type { PluginContext, PluginHost } from './plugin-context'

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

export abstract class Plugin implements Named {
  protected readonly logger: Logger
  readonly manifest: PluginManifest

  constructor({ logger }: PluginArgs, manifest: PluginManifest) {
    this.logger = logger.child(`[${this.name}] - `)
    this.manifest = manifest
  }

  get name(): string {
    return this.constructor.name
  }

  // Runs first, for ALL plugins, before any context/DI-scope is built. Wire instance-level
  // infrastructure here via the narrow host (e.g. VfsPlugin binds a per-plugin VFS scope) — so a
  // contribution applies to every plugin, the declaring one included, independent of registration order.
  setup(host: PluginHost): void {}

  create(ctx: PluginContext): void {
    this.logger.info('Creating...')
  }

  configure(ctx: PluginContext): void {
    this.logger.info('Configuring...')
  }

  start(ctx: PluginContext): Promise<void> {
    this.logger.info('Starting...')
    return Promise.resolve()
  }

  stop(ctx: PluginContext): Promise<void> {
    this.logger.info('Stopping...')
    return Promise.resolve()
  }
}

export class PluginContainer extends LazyContainer<Plugin> {
  private readonly logger: Logger

  constructor(logger: Logger) {
    super('Plugin')
    this.logger = logger
  }

  // Per-plugin base args. The DI scope/home are no longer plumbed through here — each plugin's
  // capabilities arrive via the PluginContext that ArxHub hands to its lifecycle phases.
  private base(): PluginArgs {
    return { logger: this.logger }
  }

  // TODO: waiting for biome 2.0 https://github.com/biomejs/biome/discussions/187
  // self-bound: the plugin class is its own token
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Plugin, [PluginArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends PluginArgs>(token: Constructor<Plugin, [A]>, args: () => Except<A, keyof PluginArgs>): void
  // token -> impl: resolve `token` to a `impl` instance
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Plugin>(token: Constructor<R>, impl: Constructor<R, [PluginArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Plugin, A extends PluginArgs>(token: Constructor<R>, impl: Constructor<R, [A]>, args: () => Except<A, keyof PluginArgs>): void
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Plugin>, implOrArgs?: Constructor<Plugin> | (() => object), args?: () => object): void {
    if (isConstructor(implOrArgs)) {
      super.register(token, implOrArgs, () => [{ ...this.base(), ...(args?.() ?? {}) }])
    } else {
      super.register(token, () => [{ ...this.base(), ...(implOrArgs?.() ?? {}) }])
    }
  }
}
