import { VirtualFile, VirtualFileSystem } from '~/core/vfs/api'
import * as path from '@third-party/path'
import { FileLoader, Loader, TemplateSource } from '~/core/render/api'

export class CompositeFileLoader implements Loader {
  // TODO: Create SortedList
  readonly loaders: FileLoader[]
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.loaders = []
    this.vfs = vfs
  }

  // TODO: Move errors to ErrorFactory
  async load(pathname: VirtualFile | string): Promise<TemplateSource> {
    const file = pathname instanceof VirtualFile ? pathname : await this.vfs.fileOrNull(pathname)
    if (file == null) throw new Error(`File not found in VFS (pathname: "${pathname}")`)

    const loader = this.loaders.find((it) => it.test(file))
    // deno-fmt-ignore
    if (loader == null) throw new Error(`Loader not found for (pathname: "${file.pathname}", extension: "${file.extension}", type: "${file.type}", kind: "${file.kind}")`)

    return loader.load(file)
  }

  // TODO: Move resolve to vfs
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
