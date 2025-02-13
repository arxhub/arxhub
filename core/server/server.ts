import { Hono } from '@third-party/hono'
import { Plugin } from '~/core/plugin'

// TODO: Maybe add Server interface, to hide Hono implementation
export class Server extends Hono {
  constructor(plugins: Plugin<Server>[] = []) {
    super()
    plugins.forEach((it) => it.apply(this))
  }
}
