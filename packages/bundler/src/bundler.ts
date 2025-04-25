import { Container } from '@arxhub/stdlib/collections/container'
import type { SearchableFileSystem } from '@arxhub/vfs'

export type Entrypoint = {
  content: string
  contentType: string
  sourcefile: string
  loader: 'ts' | 'css'
  plugins?: {
    virtual?: true
    nodePolyfill?: true
  }
}

export type EntrypointFactory = (files: SearchableFileSystem) => Promise<Entrypoint>

export abstract class Bundler {
  protected files: SearchableFileSystem
  private registry: Container<EntrypointFactory>

  constructor(vfs: SearchableFileSystem) {
    this.files = vfs
    this.registry = new Container('Bundler Modules')
  }

  registerModule(type: string, factory: EntrypointFactory): void {
    this.registry.set(type, factory)
  }

  async build(moduleType: string): Promise<{ content: string; contentType: string }> {
    const factory = this.registry.get(moduleType)
    const entrypoint = await factory(this.files)
    const content = await this.bundle(entrypoint, moduleType)
    return { content, contentType: entrypoint.contentType }
  }

  abstract bundle(entrypoint: Entrypoint, moduleType: string): Promise<string>
}
