import { ArxHub } from '~/core/arxhub'
import { Plugin } from '~/core/plugin'
import { Server } from './server.ts'

export class HealthCheckServerPlugin implements Plugin<ArxHub> {
  readonly name = 'healthcheck_server'

  apply(target: ArxHub): void {
    const server = target.extensions.get<Server>('server')
    server.get('/healthcheck', (c) => c.text('200 OK'))
  }
}
