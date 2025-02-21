import { NamedContainer } from './named_container.ts'

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
}
