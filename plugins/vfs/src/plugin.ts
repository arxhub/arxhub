import type { ArxHub, Plugin } from '@arxhub/core'
import { VirtualFileSystemExtension } from './extension'

export class VirtualFileSystemPlugin implements Plugin<ArxHub> {
  readonly name: string

  constructor() {
    this.name = VirtualFileSystemPlugin.name
  }

  apply(target: ArxHub): void {
    target.extensions.add(new VirtualFileSystemExtension())
  }
}
