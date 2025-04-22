import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Logger } from './logger'

export abstract class Extension {
  protected readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = logger.child(`[${this.name}] - `)
  }

  get name(): string {
    return this.constructor.name
  }
}

export class ExtensionContainer extends LazyContainer<Extension> {
  constructor() {
    super('Extension')
  }
}
