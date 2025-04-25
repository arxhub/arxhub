import { type Bundler, ESBuildBundler } from '@arxhub/bundler'
import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { SearchableFileSystem } from '@arxhub/vfs'

export type WebAppServerExtensionArgs = ExtensionArgs & {
  files: SearchableFileSystem
}

export class WebAppServerExtension extends Extension {
  readonly bundler: Bundler

  constructor(args: WebAppServerExtensionArgs) {
    super(args)
    this.bundler = new ESBuildBundler(args.files)
  }
}
