import { type ArxHub, type Logger, Plugin } from '@arxhub/core'
import manifest from '../manifest'
import { VirtualFileSystemExtension } from './extension'

export class VirtualFileSystemPlugin extends Plugin<ArxHub> {
  constructor(logger: Logger) {
    super(logger, manifest)
  }

  override create(target: ArxHub): void {
    target.extensions.register(VirtualFileSystemExtension)
  }
}
