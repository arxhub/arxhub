import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { NamedFactory } from '@arxhub/stdlib/collections/named-factory'

export interface Extension {
  readonly name: string
}

export class ExtensionContainer extends LazyContainer<Extension> {
  constructor(extensions: NamedFactory<Extension>[] = []) {
    super('Extension', extensions)
  }
}
