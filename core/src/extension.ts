import { NamedContainer } from '@arxhub/stdlib/collections'

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

  getByTypeOrNull<R extends Extension>(extenstion: ExtensionConstructor<R>): R | null {
    return this.getOrNull(extenstion.name)
  }

  getByType<R extends Extension>(extenstion: ExtensionConstructor<R>): R {
    return this.get(extenstion.name)
  }
}
