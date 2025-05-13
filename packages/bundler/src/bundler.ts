import { Container } from '@arxhub/stdlib/collections/container'

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

export type BuildResult = {
  content: string
  contentType: string
}

export type EntrypointFactory = () => Promise<Entrypoint>

export abstract class Bundler {
  private registry: Container<EntrypointFactory>

  constructor() {
    this.registry = new Container('Bundler Modules')
  }

  registerModule(type: string, factory: EntrypointFactory): void {
    this.registry.set(type, factory)
  }

  async build(moduleType: string): Promise<BuildResult> {
    const factory = this.registry.get(moduleType)
    const entrypoint = await factory()
    const content = await this.bundle(entrypoint, moduleType)
    return { content, contentType: entrypoint.contentType }
  }

  abstract bundle(entrypoint: Entrypoint, moduleType: string): Promise<string>
}
