import * as path from '@third-party/path'
import type { VirtualFileSystem } from '~/plugins/vfs/system.ts'
import type { FileLoader } from './api/file_loader.ts'
import type { Loader } from './api/loader.ts'
import type { TemplateSource } from './api/template_source.ts'
import { FileLoaderNotFound } from './file_loader_not_found.ts'

export class CompositeFileLoader implements Loader {
  readonly loaders: FileLoader[]
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.loaders = []
    this.vfs = vfs
  }

  async load(location: string): Promise<TemplateSource> {
    const file = await this.vfs.file(location)
    const loader = this.loaders.find((it) => it.test(file))

    if (loader == null) throw new FileLoaderNotFound(file)

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
