import { describe, expect, it } from 'vitest'
import { isConstructor, LazyContainer } from '../collections/lazy-container'

class Animal {
  sound(): string {
    return 'generic'
  }
}
class Dog extends Animal {
  override sound(): string {
    return 'woof'
  }
}
class Cat extends Animal {
  override sound(): string {
    return 'meow'
  }
}

describe('LazyContainer', () => {
  it('self-binds a class to itself and resolves a lazy singleton', () => {
    const c = new LazyContainer<Animal>('Animal')
    c.register(Dog)

    const a = c.get(Dog)
    const b = c.get(Dog)
    expect(a).toBeInstanceOf(Dog)
    expect(a.sound()).toBe('woof')
    expect(a).toBe(b) // instantiated once, cached
  })

  it('passes constructor args via the args thunk', () => {
    class Greeter {
      constructor(readonly name: string) {}
    }
    const c = new LazyContainer<Greeter>('Greeter')
    c.register(Greeter, () => ['hi'])

    expect(c.get(Greeter).name).toBe('hi')
  })

  it('resolves a token to a different implementation (token -> impl)', () => {
    const c = new LazyContainer<Animal>('Animal')
    c.register(Animal, Cat)

    const resolved = c.get(Animal)
    expect(resolved).toBeInstanceOf(Cat)
    expect(resolved.sound()).toBe('meow')
  })

  it('binds a token to an impl with args', () => {
    class Base {
      label = 'base'
    }
    class Impl extends Base {
      constructor(label: string) {
        super()
        this.label = label
      }
    }
    const c = new LazyContainer<Base>('Base')
    c.register(Base, Impl, () => ['custom'])

    expect(c.get(Base).label).toBe('custom')
  })

  it('keys on the constructor reference, not its name (survives minification)', () => {
    // Two distinct classes minified to the same `.name` — a name-keyed container would collide.
    const A = class {
      id = 'a'
    }
    const B = class {
      id = 'b'
    }
    Object.defineProperty(A, 'name', { value: 'X' })
    Object.defineProperty(B, 'name', { value: 'X' })
    expect(A.name).toBe(B.name)

    const c = new LazyContainer<{ id: string }>('Thing')
    c.register(A)
    c.register(B)

    expect(c.get(A).id).toBe('a')
    expect(c.get(B).id).toBe('b')
  })

  it('reports registration via has() and throws on an unregistered token', () => {
    const c = new LazyContainer<Animal>('Animal')
    c.register(Dog)

    expect(c.has(Dog)).toBe(true)
    expect(c.has(Cat)).toBe(false)
    expect(() => c.get(Cat)).toThrow(/Animal/)
  })

  it('instantiate() builds every registered token', () => {
    const c = new LazyContainer<Animal>('Animal')
    c.register(Dog)
    c.register(Animal, Cat)

    const all = c.instantiate()
    expect(all.map((a) => a.sound()).sort()).toEqual(['meow', 'woof'])
    expect(c.instances()).toHaveLength(2)
  })

  it('isConstructor distinguishes classes from arrow thunks', () => {
    expect(isConstructor(Dog)).toBe(true)
    expect(isConstructor(() => [])).toBe(false)
    expect(isConstructor(undefined)).toBe(false)
  })
})
