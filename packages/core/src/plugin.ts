import { isConstructor, LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Named } from '@arxhub/stdlib/collections/named'
import type { Scope } from '@arxhub/vfs'
import type { Constructor, Except } from 'type-fest'
import type { Logger } from './logger'
import { PluginHome, RootVfs } from './plugin-home'

// A manifest-declared permission (Tauri fs:scope shape): either a bare identifier (`'vfs:default'`)
// or a scope object that grants allow/deny path globs under an identifier (`'vfs:scope'`).
export type PluginPermission = string | (Scope & { identifier: string })

export interface PluginManifest {
  name: string
  version: string
  description?: string
  author: string
  minApi?: string
  permissions?: PluginPermission[]
}

export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return manifest
}

export type PluginArgs = {
  logger: Logger
  container: LazyContainer<object>
}

export abstract class Plugin<T> implements Named {
  protected readonly logger: Logger
  protected readonly container: LazyContainer<object>
  readonly manifest: PluginManifest

  constructor({ logger, container }: PluginArgs, manifest: PluginManifest) {
    this.logger = logger.child(`[${this.name}] - `)
    this.manifest = manifest
    this.container = container
    // Seed this plugin's own scope. PluginHome is built lazily from the root vfs (resolved from the
    // parent `services` container) and THIS manifest — so Core, not the subclass, owns the home id.
    container.register(PluginHome, () => [container.get(RootVfs).fs, manifest])
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
  private readonly logger: Logger
  private readonly services: LazyContainer<object>

  constructor(logger: Logger, services: LazyContainer<object>) {
    super('Plugin')
    this.logger = logger
    this.services = services
  }

  // Per-plugin base args. Each plugin gets its OWN child scope (parent = the shared `services`
  // container), so its PluginHome binding stays isolated while globals fall through to the parent.
  private base(): PluginArgs {
    return { logger: this.logger, container: this.services.child('PluginScope') }
  }

  // TODO: waiting for biome 2.0 https://github.com/biomejs/biome/discussions/187
  // self-bound: the plugin class is its own token
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Plugin<T>, [PluginArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends PluginArgs>(token: Constructor<Plugin<T>, [A]>, args: () => Except<A, keyof PluginArgs>): void
  // token -> impl: resolve `token` to a `impl` instance
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Plugin<T>>(token: Constructor<R>, impl: Constructor<R, [PluginArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Plugin<T>, A extends PluginArgs>(token: Constructor<R>, impl: Constructor<R, [A]>, args: () => Except<A, keyof PluginArgs>): void
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Plugin<T>>, implOrArgs?: Constructor<Plugin<T>> | (() => object), args?: () => object): void {
    if (isConstructor(implOrArgs)) {
      super.register(token, implOrArgs, () => [{ ...this.base(), ...(args?.() ?? {}) }])
    } else {
      super.register(token, () => [{ ...this.base(), ...(implOrArgs?.() ?? {}) }])
    }
  }
}
