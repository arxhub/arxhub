import { Container } from './container'
import type { Named } from './named'
import type { NamedFactory } from './named-factory'

type Entry<T extends Named> = {
  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any args
  factory: NamedFactory<T, any[]>
  args: unknown[]
}

export class LazyContainer<T extends Named> {
  private readonly factories: Container<Entry<T>>
  private readonly instances: Container<T>

  constructor(domain: string) {
    this.factories = new Container(`${domain} Factory`)
    this.instances = new Container(`${domain} Instance`)
  }

  register<A extends unknown[]>(factory: NamedFactory<T, A>, ...args: A): void {
    this.factories.set(factory.name, { factory, args })
  }

  has(factory: NamedFactory<T>): boolean {
    return this.factories.has(factory.name)
  }

  // biome-ignore lint/suspicious/noExplicitAny:We don't care about args here, it should be checked in the register function
  get<R extends T>(factory: NamedFactory<R, any[]>): R {
    let instance = this.instances.getOrNull(factory.name) as R | null
    if (instance == null) {
      const { factory: realFactory, args } = this.factories.get(factory.name)
      instance = new realFactory(...args) as R
      this.instances.set(factory.name, instance)
    }
    return instance
  }

  instantiate(): T[] {
    const instances: T[] = []
    for (const { factory } of this.factories.values()) {
      instances.push(this.get(factory))
    }
    return instances
  }
}
