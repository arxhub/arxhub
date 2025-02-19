import { Plugin } from '~/core/plugin'
import { ArxHub } from '~/core/arxhub'
import { Server } from './server.ts'

export class ServerPlugin implements Plugin<ArxHub> {
  apply(target: ArxHub): void {
    const server = new Server()
    target.extensions.add('server', server)
  }

  start(target: ArxHub): Promise<void> {
    const server = target.extensions.get<Server>('server')
    return server.serve()
  }

  stop(target: ArxHub): Promise<void> {
    const server = target.extensions.get<Server>('server')
    return server.shutdown()
  }
}
