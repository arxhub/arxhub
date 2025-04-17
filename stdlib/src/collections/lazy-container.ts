import { KeyError } from '../errors/key-error'
import { arrayToRecord } from '../record/array-to-record'
import type { Named } from './named'
import { NamedContainer } from './named-container'
import type { NamedFactory } from './named-factory'

export class LazyContainer<T extends Named, A extends unknown[] = []> {
  private readonly domain: string
  private readonly _factories: NamedContainer<NamedFactory<T, A>>
  private readonly _instances: NamedContainer<T>

  constructor(domain: string, factories: NamedFactory<T, A>[] = []) {
    this.domain = domain
    this._factories = new NamedContainer(domain, arrayToRecord(factories))
    this._instances = new NamedContainer(domain)
  }

  register(factory: NamedFactory<T, A>): void {
    this._factories.add(factory)
  }

  has(factory: NamedFactory<T, A>): boolean {
    return this._factories.has(factory.name)
  }

  getOrNull<R extends T>(factory: NamedFactory<R, A>): R | null {
    return this._instances.getOrNull<R>(factory.name)
  }

  get<R extends T>(factory: NamedFactory<R, A>): R {
    const value = this.getOrNull(factory)
    if (value == null) throw new KeyError(`${this.domain} '${factory.name}' not found`)
    return value
  }

  factories(): NamedFactory<T, A>[] {
    return this._factories.values()
  }

  instances(): T[] {
    return this._instances.values()
  }

  instantiate(...args: A): T[] {
    const instances: T[] = []
    for (const factory of this.factories()) {
      let instance = this._instances.getOrNull(factory.name)
      if (instance == null) {
        instance = new factory(...args)
        this._instances.add(instance)
      }
      instances.push(instance)
    }
    return instances
  }
}
