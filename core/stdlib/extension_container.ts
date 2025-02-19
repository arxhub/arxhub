import { ErrorFactory } from '~/core/error/error-factory.ts'

export class ExtensionContainer {
  private readonly container: Map<string, unknown>

  constructor(extensions: Record<string, unknown> = {}) {
    this.container = new Map(Object.entries(extensions))
  }

  getOrNull<T>(key: string): T | null {
    const value = this.container.get(key)
    return value == null ? null : value as T
  }

  get<T>(key: string): T {
    const value = this.getOrNull(key)
    if (value == null) throw ErrorFactory.KeyError(`Extension '${key}' not found`)
    return value as T
  }

  has(key: string): boolean {
    return this.container.has(key)
  }

  add(key: string, value: unknown): void {
    this.container.set(key, value)
  }
}
