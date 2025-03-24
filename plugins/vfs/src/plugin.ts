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

  async create(target: ArxHub): Promise<void> {
    target.extensions.add(new VirtualFileSystemExtension())
  }
}

export default new VirtualFileSystemPlugin()
