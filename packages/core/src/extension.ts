import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'
import type { Logger } from './logger'

export interface ExtensionArgs {
  logger: Logger
}

export abstract class Extension {
  protected readonly logger: Logger

  constructor(args: ExtensionArgs) {
    this.logger = args.logger.child(`[${this.name}] - `)
  }

  get name(): string {
    return this.constructor.name
  }
}

export class ExtensionContainer extends LazyContainer<Extension, [ExtensionArgs]> {
  constructor(extensions: NamedFactory<Extension>[] = []) {
    super('Extension', extensions)
  }
}
