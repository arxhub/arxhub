import * as path from '@third-party/path'
import { VirtualFileSystem } from '~/plugins/vfs/system.ts'
import { FileLoader } from '~/plugins/render/api/file_loader.ts'
import { Loader } from '~/plugins/render/api/loader.ts'
import { TemplateSource } from '~/plugins/render/api/template_source.ts'

export class CompositeFileLoader implements Loader {
  readonly loaders: FileLoader[]
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.loaders = []
    this.vfs = vfs
  }

  // TODO: Move errors to ErrorFactory
  async load(location: string): Promise<TemplateSource> {
    const file = await this.vfs.file(location)
    const loader = this.loaders.find((it) => it.test(file))

    // deno-fmt-ignore
    if (loader == null) throw new Error(`Loader not found for (pathname: "${file.pathname}", extension: "${file.extension}", type: "${file.type}", kind: "${file.kind}")`)

    return loader.load(file)
  }

  // TODO: Move resolve to vfs
  //       Add prefix support
  resolve(from: string, pathname: string): string {
    if (pathname.startsWith('.')) {
      return path.join(path.dirname(from), pathname)
    }

    if (pathname.startsWith('/')) {
      return pathname
    }

    return path.join(path.dirname(from), pathname)
  }
}
