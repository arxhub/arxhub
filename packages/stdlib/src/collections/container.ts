import { KeyError } from '../errors/key-error'

export class Container<T> {
  private readonly container: Map<string, T>
  private readonly domain: string

  constructor(domain: string, objects: Record<string, T> = {}) {
    this.container = new Map(Object.entries(objects))
    this.domain = domain
  }

  getOrNull(key: string): T | null {
    return this.container.get(key) ?? null
  }

  get(key: string): T {
    const value = this.container.get(key)
    if (value == null) throw new KeyError(`${this.domain} '${key}' not found`)
    return value
  }

  has(key: string): boolean {
    return this.container.has(key)
  }

  set(key: string, object: T): void {
    this.container.set(key, object)
  }

  values(): T[] {
    return Array.from(this.container.values())
  }
}
