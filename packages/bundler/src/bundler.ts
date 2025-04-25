import type { SearchableFileSystem } from '@arxhub/vfs'

export type Entrypoint = {
  content: string
  loader: string
}

export type EntrypointFactory = (vfs: SearchableFileSystem) => Promise<Entrypoint>

export abstract class Bundler {
  protected vfs: SearchableFileSystem
  protected registry: Map<string, EntrypointFactory>

  constructor(vfs: SearchableFileSystem) {
    this.vfs = vfs
    this.registry = new Map()
  }

  get modules(): string[] {
    return [...this.registry.keys()]
  }

  registerModule(type: string, factory: EntrypointFactory): void {
    this.registry.set(type, factory)
  }

  abstract build(moduleType: string): Promise<string>
}
