import { ErrorFactory } from '~/core/error/error-factory.ts'
import { Plugin } from '../plugin/plugin.ts'

export class PluginContainer<T> {
  private readonly target: T
  private readonly container: Map<string, Plugin<T>>

  constructor(target: T, plugins: Record<string, Plugin<T>> = {}) {
    this.target = target
    this.container = new Map(Object.entries(plugins))
  }

  getOrNull(key: string): Plugin<T> | null {
    const value = this.container.get(key)
    return value == null ? null : value
  }

  get(key: string): Plugin<T> {
    const value = this.getOrNull(key)
    if (value == null) throw ErrorFactory.KeyError(`Plugin '${key}' not found`)
    return value
  }

  has(key: string): boolean {
    return this.container.has(key)
  }

  apply(key: string, value: Plugin<T>): void {
    this.container.set(key, value)
    value.apply(this.target)
  }

  values(): Plugin<T>[] {
    return Array.from(this.container.values())
  }
}
