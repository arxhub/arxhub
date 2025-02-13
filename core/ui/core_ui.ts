import { Plugin } from '~/core/plugin'
import { Server } from '~/core/server'

export class CoreUI implements Plugin<Server> {
  apply(target: Server): void {
    throw new Error('Method not implemented.')
  }
}
