import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'

export abstract class Extension {
  get name(): string {
    return this.constructor.name
  }
}

export class ExtensionContainer extends LazyContainer<Extension> {
  constructor(extensions: NamedFactory<Extension>[] = []) {
    super('Extension', extensions)
  }
}
