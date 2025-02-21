import { Extension } from '../../core/extension.ts'
import { Server } from './server.ts'

export class ServerExtension implements Extension {
  readonly name: string
  readonly server: Server

  constructor() {
    this.name = ServerExtension.name
    this.server = new Server()
  }
}
