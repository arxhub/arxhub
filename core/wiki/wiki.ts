import { Plugin } from '~/core/modules/plugin/api'
import { PluginMetadata } from '../modules/plugin/api/plugin.ts'

export class Wiki {
  private readonly extensions: Map<string, unknown>

  constructor() {
    this.extensions = new Map()
  }

  use<W extends this, Ex extends object>(plugin: Plugin<W, E>): Promise<W & E> {
    return plugin.apply(this as W)
  }
}

type PluginAExt = {
  a: string
}

class PluginA implements Plugin<Wiki, PluginAExt> {
  metadata!: PluginMetadata

  apply(target: Wiki): Promise<Wiki & PluginAExt> {
    throw new Error('Method not implemented.')
  }
}

type PluginBExt = {
  b: string
}

class PluginB implements Plugin<Wiki & PluginAExt, PluginBExt> {
  metadata!: PluginMetadata

  apply(target: Wiki & PluginAExt): Promise<Wiki & PluginAExt & PluginBExt> {
    throw new Error('Method not implemented.')
  }
}

const wiki = new Wiki()
const wikiWithA = await wiki.use<Wiki, PluginAExt>(new PluginB())
const temp = wikiWithA.a
