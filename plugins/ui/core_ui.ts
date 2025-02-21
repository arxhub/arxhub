import { Plugin } from '~/core/plugin'
import { Server } from '~/core/server/server.ts'

export class CoreUI implements Plugin<Server> {
  apply(_target: Server): void {
    throw new Error('Method not implemented.')
  }
}
