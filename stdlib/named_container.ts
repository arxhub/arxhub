import { KeyError } from '~/stdlib/key_error.ts'
import { Named } from '~/stdlib/named.ts'

export class NamedContainer<N extends Named> {
  private readonly container: Map<string, N>
  private readonly name: string

  constructor(name: string, objects: Record<string, N> = {}) {
    this.container = new Map<string, N>(Object.entries(objects))
    this.name = name
  }

  getOrNull<T extends N>(name: string): T | null {
    const value = this.container.get(name)
    return value == null ? null : value as T
  }

  get<T extends N>(name: string): T {
    const value = this.container.get(name)
    if (value == null) throw new KeyError(`${this.name} '${name}' not found`)
    return value as T
  }

  has(name: string): boolean {
    return this.container.has(name)
  }

  add<T extends N>(object: T): void {
    this.container.set(object.name, object)
  }

  values(): N[] {
    return Array.from(this.container.values())
  }
}
