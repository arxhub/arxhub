import { NamedContainer } from '@arxhub/stdlib/collections'

export interface Plugin<T> {
  readonly name: string
  apply(target: T): void

  start?(target: T): Promise<void>
  stop?(target: T): Promise<void>
}

export type PluginConstructor<T extends Plugin<unknown>> = {
  readonly name: string
  new (...args: unknown[]): T
}

export class PluginContainer<T> extends NamedContainer<Plugin<T>> {
  private readonly target: T

  constructor(target: T, plugins: Record<string, Plugin<T>> = {}) {
    super('Plugin', plugins)
    this.target = target
  }

  getByTypeOrNull<R extends Plugin<T>>(plugin: PluginConstructor<R>): R | null {
    return this.getOrNull(plugin.name)
  }

  getByType<R extends Plugin<T>>(plugin: PluginConstructor<R>): R {
    return this.get(plugin.name)
  }

  apply(value: Plugin<T>): void {
    this.add(value)
    value.apply(this.target)
  }
}
