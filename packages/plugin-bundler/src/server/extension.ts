import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { SearchableFileSystem } from '@arxhub/vfs'
import type { Bundler } from './bundler'
import { ESBuildBundler } from './esbuild-bundler'

export type BundlerServerExtensionArgs = ExtensionArgs & {
  vfs: SearchableFileSystem
}

export class BundlerServerExtension extends Extension {
  readonly bundler: Bundler

  constructor(args: BundlerServerExtensionArgs) {
    super(args)
    this.bundler = new ESBuildBundler(args.vfs)
  }
}
