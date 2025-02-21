import { ArxHub } from '../../core/arxhub.ts'
import { Plugin } from '../../core/plugin.ts'
import { ServerExtension } from './extension.ts'

export class ServerPlugin implements Plugin<ArxHub> {
  readonly name: string

  constructor() {
    this.name = ServerPlugin.name
  }

  apply(target: ArxHub): void {
    target.extensions.add(new ServerExtension())
  }

  start(target: ArxHub): Promise<void> {
    const { server } = target.extensions.getByType(ServerExtension)
    return server.serve()
  }

  stop(target: ArxHub): Promise<void> {
    const { server } = target.extensions.getByType(ServerExtension)
    return server.shutdown()
  }
}
