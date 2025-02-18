export class ExtensionContainer {
  private readonly __container: Map<string, unknown>

  constructor(extensions: Record<string, unknown>) {
    this.__container = new Map(Object.entries(extensions))
  }

  get(key: string): unknown {
    return this.__container.get(key)
  }

  has(key: string): boolean {
    return this.__container.has(key)
  }

  add(key: string, value: unknown): void {
    this.__container.set(key, value)
  }
}
