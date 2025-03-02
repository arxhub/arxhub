import { ArxHub } from '~/core/arxhub.ts'
import { Plugin } from '~/core/plugin.ts'
import { VirtualFileSystemExtension } from '~/plugins/vfs/extension.ts'

export class VirtualFileSystemPlugin implements Plugin<ArxHub> {
  readonly name: string

  constructor() {
    this.name = VirtualFileSystemPlugin.name
  }

  apply(target: ArxHub): void {
    target.extensions.add(new VirtualFileSystemExtension())
  }
}
