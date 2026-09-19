import { keyError } from '@arxhub/errors'

export class Container<T> {
  private readonly container: Map<string, T>
  private readonly domain: string

  constructor(domain: string, objects: Record<string, T> = {}) {
    this.container = new Map(Object.entries(objects))
    this.domain = domain
  }

  getOrNull(key: string): T | null {
    if (!this.container.has(key)) return null
    return this.container.get(key)!
  }

  get(key: string): T {
    if (!this.container.has(key)) throw keyError(`${this.domain} '${key}' not found`)
    return this.container.get(key)!
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
