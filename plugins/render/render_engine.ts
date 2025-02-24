import { CompositeFileLoader } from '~/plugins/render/composite_file_loader.ts'
import { Environment } from '~/plugins/render/environment.ts'
import vento from '@third-party/vento'
import { Plugin } from '~/core/plugin.ts'
import { VirtualFileSystem } from '~/plugins/vfs/system.ts'
import { RenderOptions } from '~/plugins/render/api/render_options.ts'

// TODO: Maybe add Server interface, to hide RenderEngine implementation api
export class RenderEngine {
  private readonly loader: CompositeFileLoader
  private readonly env: Environment

  constructor(vfs: VirtualFileSystem, plugins: Plugin<RenderEngine>[] = []) {
    this.loader = new CompositeFileLoader(vfs)
    this.env = vento({
      includes: this.loader,
      dataVarname: 'it',
      autoescape: false,
      autoDataVarname: true,
    })

    // TODO: use empty environment, instead of predefined vento
    // new Environment({
    //   loader: this.loader,
    //   dataVarname: 'it',
    //   autoescape: false,
    //   autoDataVarname: true,
    // })

    plugins.forEach((it) => it.apply(this))
  }

  async render(location: string, options: RenderOptions): Promise<string> {
    const template = await this.loader.load(location)
    const data = { mode: options.mode, ...options.data, ...template.data }
    const { content } = await this.env.runString(template.source, data, location)
    return content
  }

  public get fileLoaders() {
    return this.loader.loaders
  }

  public get tokenPreprocessors() {
    return this.env.tokenPreprocessors
  }

  public get utils() {
    return this.env.utils
  }

  public get filters() {
    return this.env.filters
  }

  public get tags() {
    return this.env.tags
  }

  public get cache() {
    return this.env.cache
  }
}
