import { Extension, type Logger } from '@arxhub/core'
import type { SearchableFileSystem } from '@arxhub/vfs'
import type { Bundler } from './bundler'
import { ESBuildBundler } from './esbuild-bundler'

export class BundlerServerExtension extends Extension {
  readonly bundler: Bundler

  constructor(logger: Logger, vfs: SearchableFileSystem) {
    super(logger)
    this.bundler = new ESBuildBundler(vfs)
  }
}
