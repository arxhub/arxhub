import { Registry } from '../utils/registry.ts'
import { VirtualFileSystem } from '../api/vfs/mod.ts'
import { Renderer } from '../render/api/renderer.ts'
import { Plugin } from '../plugin/api/mod.ts'

export class Wiki {
  public readonly vfs: Registry<VirtualFileSystem>
  public readonly renderer: Registry<Renderer>

  public constructor(plugins: Plugin<Wiki>[]) {
    this.vfs = new Registry('vfs')
    this.renderer = new Registry('renderer')
  }
}
