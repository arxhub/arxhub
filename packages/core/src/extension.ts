import { isConstructor, LazyContainer } from '@arxhub/di'
import type { Constructor, Except } from 'type-fest'
import type { Logger } from './logger'

export type ExtensionArgs = {
  logger: Logger
}

export abstract class Extension {
  protected readonly logger: Logger

  constructor({ logger }: ExtensionArgs) {
    this.logger = logger.child(`[${this.name}] - `)
  }

  get name(): string {
    return this.constructor.name
  }
}

export class ExtensionContainer extends LazyContainer<Extension> {
  private readonly defaults: ExtensionArgs

  constructor(defaults: ExtensionArgs) {
    super('Extension')
    this.defaults = defaults
  }

  // TODO: waiting for biome 2.0 https://github.com/biomejs/biome/discussions/187
  // self-bound: the extension class is its own token
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Extension, [ExtensionArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends ExtensionArgs>(token: Constructor<Extension, [A]>, args: () => Except<A, keyof ExtensionArgs>): void
  // token -> impl: resolve `token` to a `impl` instance
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Extension>(token: Constructor<R>, impl: Constructor<R, [ExtensionArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<R extends Extension, A extends ExtensionArgs>(token: Constructor<R>, impl: Constructor<R, [A]>, args: () => Except<A, keyof ExtensionArgs>): void
  // biome-ignore format: Hand formatting is more readable
  override register(token: Constructor<Extension>, implOrArgs?: Constructor<Extension> | (() => object), args?: () => object): void {
    if (isConstructor(implOrArgs)) {
      super.register(token, implOrArgs, () => [{ ...this.defaults, ...(args?.() ?? {}) }])
    } else {
      super.register(token, () => [{ ...this.defaults, ...(implOrArgs?.() ?? {}) }])
    }
  }
}
