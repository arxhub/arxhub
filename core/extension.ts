import { NamedContainer } from '../stdlib/named_container.ts'

export interface Extension {
  readonly name: string
}

export type ExtensionConstructor<T extends Extension> = {
  readonly name: string
  new (...args: unknown[]): T
}

export class ExtensionContainer extends NamedContainer<Extension> {
  constructor(extensions: Record<string, Extension> = {}) {
    super('Extension', extensions)
  }

  getByTypeOrNull<R extends Extension>(constructor: ExtensionConstructor<R>): R | null {
    return this.getOrNull(constructor.name)
  }

  getByType<R extends Extension>(constructor: ExtensionConstructor<R>): R {
    return this.get(constructor.name)
  }
}
