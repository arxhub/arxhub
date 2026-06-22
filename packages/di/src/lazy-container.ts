import { keyError } from '@arxhub/errors'
import type { Constructor } from 'type-fest'

// biome-ignore lint/suspicious/noExplicitAny: impl constructors accept varying argument tuples
type AnyConstructor<T> = Constructor<T, any[]>

declare const KEY_TYPE: unique symbol

// A typed, symbol-branded DI key for binding a VALUE directly — an already-built instance (e.g. a
// filesystem), not a class to construct. `get(key)` returns the bound value as-is, no `new`, no args.
// Use a constructor token instead when the container should instantiate the class.
export interface Key<T> {
  readonly id: symbol
  readonly name: string
  // Phantom: carries T for inference only; never present at runtime.
  readonly [KEY_TYPE]?: T
}

export function createKey<T>(name: string): Key<T> {
  return { id: Symbol(name), name }
}

// A token is either a constructor (instantiated via `new`) or a value Key (resolved via its factory).
type Token<T> = AnyConstructor<T> | Key<T>

type Entry<T> = { kind: 'ctor'; impl: AnyConstructor<T>; args?: () => unknown[] } | { kind: 'value'; factory: () => T }

// Distinguishes an implementation class from an args thunk in the 2-arg register() form.
// Class constructors carry a `prototype`; arrow functions (how args thunks are always written
// in this codebase) do not. A plain `function () {}` thunk would be misdetected — don't use one.
export function isConstructor(value: unknown): value is AnyConstructor<unknown> {
  return typeof value === 'function' && (value as { prototype?: unknown }).prototype != null
}

// A lazy DI container. The registered token IS the lookup key — keyed by object identity (the
// constructor *reference* or the `Key` object), not by name, so it survives minification with no
// `keepNames`. Two binding styles:
//   - register(Ctor[, impl][, args])  → the container builds it via `new` (token -> self or -> impl)
//   - bind(Key, () => value)          → the container returns the factory's value directly
//
// Containers are hierarchical: a child resolves a token locally first and, on a miss, delegates to
// its parent ("check locally, else go to parent"). Parent-owned singletons are cached in the parent,
// so they stay shared across all children; a local binding shadows the parent for that scope only.
export class LazyContainer<T> {
  private readonly domain: string
  private readonly parent?: LazyContainer<T>
  private readonly _factories = new Map<Token<T>, Entry<T>>()
  private readonly _instances = new Map<Token<T>, T>()

  constructor(domain: string, parent?: LazyContainer<T>) {
    this.domain = domain
    this.parent = parent
  }

  // A new child scope whose unresolved tokens fall through to this container.
  child(domain?: string): LazyContainer<T> {
    return new LazyContainer<T>(domain ?? this.domain, this)
  }

  // self-bound: the token is its own implementation
  register(token: Constructor<T, []>): void
  register<A extends unknown[]>(token: Constructor<T, A>, args: () => [...A]): void
  // token -> impl: resolve `token` to an instance of `impl`
  register<R extends T>(token: AnyConstructor<R>, impl: Constructor<R, []>): void
  register<R extends T, A extends unknown[]>(token: AnyConstructor<R>, impl: Constructor<R, A>, args: () => [...A]): void
  register(token: AnyConstructor<T>, implOrArgs?: AnyConstructor<T> | (() => unknown[]), args?: () => unknown[]): void {
    if (isConstructor(implOrArgs)) {
      this._factories.set(token, { kind: 'ctor', impl: implOrArgs, args })
    } else {
      this._factories.set(token, { kind: 'ctor', impl: token, args: implOrArgs })
    }
  }

  // Bind a value Key to a factory whose result is returned directly (no construction). The factory
  // runs at most once; its result is cached like any other singleton.
  bind<R extends T>(key: Key<R>, factory: () => R): void {
    this._factories.set(key, { kind: 'value', factory })
  }

  has(token: Token<T>): boolean {
    return this._factories.has(token) || (this.parent?.has(token) ?? false)
  }

  get<R extends T>(token: Token<R>): R {
    const cached = this._instances.get(token as Token<T>)
    if (cached != null) return cached as R

    const entry = this._factories.get(token as Token<T>)
    if (entry == null) {
      // Not bound locally — fall through to the parent so its singletons stay shared.
      if (this.parent != null) return this.parent.get(token)
      throw keyError(`${this.domain} '${token.name}' not found`)
    }

    const instance = entry.kind === 'value' ? entry.factory() : entry.args == null ? new entry.impl() : new entry.impl(...entry.args())
    this._instances.set(token as Token<T>, instance)
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
