import { type ArxHub, Plugin } from '@arxhub/core'
import { VirtualFileSystemExtension } from './extension'

export class VirtualFileSystemPlugin extends Plugin<ArxHub> {
  constructor() {
    super({
      name: VirtualFileSystemPlugin.name,
      version: '0.1.0',
      author: '',
    })
  }

  override create(target: ArxHub): void {
    target.extensions.register(VirtualFileSystemExtension)
  }
}
