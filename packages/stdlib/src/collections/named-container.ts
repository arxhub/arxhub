import { Container } from './container'
import type { Named } from './named'

export class NamedContainer<N extends Named> extends Container<N> {
  add<T extends N>(object: T): void {
    super.set(object.name, object)
  }
}
