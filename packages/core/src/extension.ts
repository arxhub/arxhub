import { LazyContainer } from '@arxhub/stdlib/collections/lazy-container'
import type { Logger } from './logger'
import type { Constructor, Except } from 'type-fest'

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
  // biome-ignore format: Hand formatting is more readable
  override register(factory: Constructor<Extension, [ExtensionArgs]>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends ExtensionArgs>(factory: Constructor<Extension, [A]>, args: () => Except<A, keyof ExtensionArgs>): void
  // biome-ignore format: Hand formatting is more readable
  override register<A extends ExtensionArgs>(factory: Constructor<Extension, [ExtensionArgs] | [A]>, args?: () => Except<A, keyof ExtensionArgs>): void {
    super.register(factory, args == null ? () => [this.defaults] : () => [{ ...this.defaults, ...args() }])
  }
}
