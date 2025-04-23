import { type ArxHub, type Logger, Plugin } from '@arxhub/core'
import { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/server'
import manifest from '../manifest'
import { BundlerServerExtension } from './extension'

export class BundlerServerPlugin extends Plugin<ArxHub> {
  constructor(logger: Logger) {
    super(logger, manifest)
  }

  override create(target: ArxHub): void {
    target.extensions.register(BundlerServerExtension, () => [
      target.logger,
      target.extensions.get(VirtualFileSystemServerExtension).files,
    ])
  }

  override async start(target: ArxHub): Promise<void> {
    const { bundler } = target.extensions.get(BundlerServerExtension)
    for (const type of bundler.modules) {
      await bundler.build(type)
    }
  }
}
