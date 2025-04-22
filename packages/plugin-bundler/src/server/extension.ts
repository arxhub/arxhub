import { Extension, Logger, type ExtensionArgs } from '@arxhub/core'
import type { Bundler } from './bundler'
import { ESBuildBundler } from './esbuild-bundler'

export class BundlerServerExtension extends Extension {
  readonly bundler: Bundler

  constructor(logger: Logger) {
    super(logger)
    this.bundler = new ESBuildBundler()
  }
}
