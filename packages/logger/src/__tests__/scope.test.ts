import { LazyContainer } from '@arxhub/di'
import { describe, expect, it } from 'vitest'
import { ConsoleLogger, Logger } from '../logger'
import { bindPluginLogger, RootLogger } from '../scope'

describe('bindPluginLogger', () => {
  function setup(pluginName: string) {
    const root = new LazyContainer<object>('Service')
    root.bind(RootLogger, () => new ConsoleLogger())
    const scope = root.child('PluginScope')
    bindPluginLogger(scope, { manifest: { name: pluginName } })
    return scope
  }

  it('binds the per-plugin Logger key to a name-prefixed child of RootLogger', () => {
    const scope = setup('Sync')
    const logger = scope.get(Logger)
    // The Logger key resolves to a real logger (not the RootLogger itself).
    expect(logger).toBeInstanceOf(ConsoleLogger)
    expect(logger).not.toBe(scope.get(RootLogger))
  })

  it('prefixes log output with the plugin name', () => {
    const scope = setup('Sync')
    const lines: unknown[][] = []
    const spy = { ...console, log: (...args: unknown[]) => lines.push(args) }
    const original = console.log
    console.log = spy.log
    try {
      scope.get(Logger).log('hello')
    } finally {
      console.log = original
    }
    expect(lines).toEqual([['[Sync] - hello']])
  })

  it('caches the scoped Logger as a singleton within its scope', () => {
    const scope = setup('Sync')
    expect(scope.get(Logger)).toBe(scope.get(Logger))
  })
})
