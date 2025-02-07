import { ErrorFactory } from '~/core/error'

export class Registry<T> {
  private readonly name: string
  private readonly registry: Map<string, T>

  public constructor(name: string) {
    this.name = name
    this.registry = new Map()
  }

  public has(key: string): boolean {
    return this.registry.has(key)
  }

  public getOrNull(key: string): T | null {
    return this.registry.get(key) ?? null
  }

  public get(key: string): T {
    const value = this.getOrNull(key)
    if (value == null) throw ErrorFactory.KeyError(`Key '${key}' not found in registry '${this.name}'`)
    return value
  }

  public values(): T[] {
    return this.values()
  }

  public register(key: string, value: T): void {
    if (this.has(key)) throw ErrorFactory.KeyError(`Key '${key}' already exists in registry '${this.name}'`)
    this.registry.set(key, value)
  }
}
