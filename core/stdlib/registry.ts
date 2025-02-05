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

  public get(key: string): T | undefined {
    return this.registry.get(key)
  }

  public register(key: string, value: T): void {
    if (this.has(key)) throw ErrorFactory.KeyError(this.name, key)
    this.registry.set(key, value)
  }
}
