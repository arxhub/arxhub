import type { Named } from '@arxhub/stdlib/collections/named'
import { NamedContainer } from '@arxhub/stdlib/collections/named-container'

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

  create(target: T): Promise<void> {
    return Promise.resolve()
  }

  configure(target: T): Promise<void> {
    return Promise.resolve()
  }

  start(target: T): Promise<void> {
    return Promise.resolve()
  }

  stop(target: T): Promise<void> {
    return Promise.resolve()
  }
}

export type PluginConstructor<T extends Plugin<unknown>> = {
  readonly name: string
  // biome-ignore lint/suspicious/noExplicitAny: We want to allow any arguments in constructor
  new (...args: any[]): T
}

export class PluginContainer<T> extends NamedContainer<Plugin<T>> {
  private readonly target: T

  constructor(target: T, plugins: Plugin<T>[] = []) {
    super(
      'Plugin',
      plugins.reduce(
        (acc, it) => {
          acc[it.name] = it
          return acc
        },
        {} as Record<string, Plugin<T>>,
      ),
    )
    this.target = target
  }

  getByTypeOrNull<R extends Plugin<T>>(plugin: PluginConstructor<R>): R | null {
    return this.getOrNull(plugin.name)
  }

  getByType<R extends Plugin<T>>(plugin: PluginConstructor<R>): R {
    return this.get(plugin.name)
  }

  register(value: Plugin<T>): void {
    this.add(value)
  }
}
