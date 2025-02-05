import { Registry } from './stdlib/registry.ts'
import { VirtualFileSystem } from './api/vfs/mod.ts'
import { Renderer } from './api/render/renderer.ts'
import { Plugin } from './api/plugin/mod.ts'

export class ArxWiki {
  public readonly vfs: Registry<VirtualFileSystem>
  public readonly renderer: Registry<Renderer>

  public constructor(plugins: Plugin<ArxWiki>[]) {
    this.vfs = new Registry('vfs')
    this.renderer = new Registry('renderer')
  }
}
