import {} from '@third-party/vento'
import { Plugin } from '../../plugin/mod.ts'
import { Environment } from '@third-party/vento/src/environment.ts'
import { Loader, TemplateSource } from '@third-party/vento/src/loader.ts'
import * as path from '@third-party/path'
import { VirtualFile, VirtualFileSystem } from '~/core/modules/vfs/api'

interface FileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<TemplateSource>
}

class CompositeFileLoader implements Loader {
  readonly loaders: FileLoader[]
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.loaders = []
    this.vfs = vfs
  }

  // TODO: Move errors to ErrorFactory
  async load(pathname: string): Promise<TemplateSource> {
    const file = await this.vfs.findFileOrNull(pathname)
    if (file == null) throw new Error(`File not found in VFS (pathname: "${pathname}")`)

    const loader = this.loaders.find((it) => it.test(file))
    // deno-fmt-ignore
    if (loader == null) throw new Error(`Loader not found for (pathname: "${pathname}", extension: "${file.extension}", type: "${file.type}", kind: "${file.kind}")`)

    return loader.load(file)
  }

  resolve(from: string, pathname: string): string {
    if (pathname.startsWith('.')) {
      return path.join(path.dirname(from), pathname)
    }

    if (pathname.startsWith('/')) {
      return pathname
    }

    throw new Error(`Invalid filepath: '${pathname}'. It must be either relative or absolute.`)
  }
}

export class RenderEngine {
  private readonly loader: CompositeFileLoader
  private readonly env: Environment

  constructor(vfs: VirtualFileSystem, plugins: Plugin<RenderEngine>[] = []) {
    this.loader = new CompositeFileLoader(vfs)
    this.env = new Environment({
      loader: this.loader,
      dataVarname: 'it',
      autoescape: false,
      autoDataVarname: true,
    })

    plugins.forEach((it) => it.apply(this))
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
