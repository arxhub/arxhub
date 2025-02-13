import { Plugin } from '../../plugin/mod.ts'
import { VirtualFile, VirtualFileSystem } from '~/core/modules/vfs/api'
import { CompositeFileLoader } from './composite-file-loader.ts'
import { Environment } from './environment.ts'
import { RenderOptions } from './api/render-options.ts'
import vento from '@third-party/vento'

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

  async render(file: VirtualFile, options: RenderOptions): Promise<string> {
    const template = await this.loader.load(file)
    const data = { mode: options.mode, ...options.data, ...template.data }
    const { content } = await this.env.runString(template.source, data, file.pathname)
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
