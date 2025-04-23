import type { Constructor } from 'type-fest'
import { Container } from './container'

type Entry<T> = {
  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any args
  factory: Constructor<T, any[]>
  args?: () => unknown[]
}

export class LazyContainer<T> {
  private readonly _factories: Container<Entry<T>>
  private readonly _instances: Container<T>

  constructor(domain: string) {
    this._factories = new Container(`${domain} Factory`)
    this._instances = new Container(`${domain} Instance`)
  }

  // Maybe pass logger/extensions/plugins to args function as input?
  register(factory: Constructor<T, []>): void
  register<A extends unknown[]>(factory: Constructor<T, A>, args: () => [...A]): void
  register<A extends unknown[]>(factory: Constructor<T, A>, args?: () => [...A]): void {
    this._factories.set(factory.name, { factory, args })
  }

  has(factory: Constructor<T>): boolean {
    return this._factories.has(factory.name)
  }

  // biome-ignore lint/suspicious/noExplicitAny:We don't care about args here, it should be checked in the register function
  get<R extends T>(factory: Constructor<R, any[]>): R {
    let instance = this._instances.getOrNull(factory.name)
    if (instance == null) {
      const { factory: realFactory, args } = this._factories.get(factory.name)
      instance = args == null ? new realFactory() : new realFactory(...args())
      this._instances.set(factory.name, instance)
    }
    return instance as R
  }

  instantiate(): T[] {
    const instances: T[] = []
    for (const { factory } of this._factories.values()) {
      instances.push(this.get(factory))
    }
    return instances
  }

  instances(): T[] {
    return this._instances.values()
  }
}
