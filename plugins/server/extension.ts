import { Server } from '~/plugins/server/server.ts'
import { Extension } from '~/core/extension.ts'

export class ServerExtension implements Extension {
  readonly name: string
  readonly server: Server

  constructor() {
    this.name = ServerExtension.name
    this.server = new Server()
  }
}
