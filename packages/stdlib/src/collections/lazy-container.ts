import { keyError } from '@arxhub/errors'
import type { Constructor } from 'type-fest'

// biome-ignore lint/suspicious/noExplicitAny: impl constructors accept varying argument tuples
type AnyConstructor<T> = Constructor<T, any[]>

type Entry<T> = {
  impl: AnyConstructor<T>
  args?: () => unknown[]
}

// Distinguishes an implementation class from an args thunk in the 2-arg register() form.
// Class constructors carry a `prototype`; arrow functions (how args thunks are always written
// in this codebase) do not. A plain `function () {}` thunk would be misdetected — don't use one.
export function isConstructor(value: unknown): value is AnyConstructor<unknown> {
  return typeof value === 'function' && (value as { prototype?: unknown }).prototype != null
}

// A lazy DI container. The registered token IS the lookup key — keyed by the constructor
// *reference* (object identity), not its name, so it survives minification with no `keepNames`.
// A token can be bound to itself (self-bound) or to a different implementation (token -> impl).
export class LazyContainer<T> {
  private readonly domain: string
  private readonly _factories = new Map<AnyConstructor<T>, Entry<T>>()
  private readonly _instances = new Map<AnyConstructor<T>, T>()

  constructor(domain: string) {
    this.domain = domain
  }

  // self-bound: the token is its own implementation
  register(token: Constructor<T, []>): void
  register<A extends unknown[]>(token: Constructor<T, A>, args: () => [...A]): void
  // token -> impl: resolve `token` to an instance of `impl`
  register<R extends T>(token: AnyConstructor<R>, impl: Constructor<R, []>): void
  register<R extends T, A extends unknown[]>(token: AnyConstructor<R>, impl: Constructor<R, A>, args: () => [...A]): void
  register(token: AnyConstructor<T>, implOrArgs?: AnyConstructor<T> | (() => unknown[]), args?: () => unknown[]): void {
    if (isConstructor(implOrArgs)) {
      this._factories.set(token, { impl: implOrArgs, args })
    } else {
      this._factories.set(token, { impl: token, args: implOrArgs })
    }
  }

  has(token: AnyConstructor<T>): boolean {
    return this._factories.has(token)
  }

  get<R extends T>(token: AnyConstructor<R>): R {
    let instance: T | null = this._instances.get(token) ?? null
    if (instance == null) {
      const entry = this._factories.get(token)
      if (entry == null) throw keyError(`${this.domain} '${token.name}' not found`)
      const { impl, args } = entry
      instance = args == null ? new impl() : new impl(...args())
      this._instances.set(token, instance)
    }
    return instance as R
  }

  instantiate(): T[] {
    const instances: T[] = []
    for (const token of this._factories.keys()) {
      instances.push(this.get(token))
    }
    return instances
  }

  instances(): T[] {
    return Array.from(this._instances.values())
  }
}
