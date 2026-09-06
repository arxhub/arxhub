import type { Logger } from '@arxhub/logger'
import { Type } from '@sinclair/typebox'
import { parse } from 'smol-toml'
import { beforeEach, describe, expect, it } from 'vitest'
import { deviceLocalKeys, mergeConfig, pickSchema, splitConfig } from '../device-local'
import { PluginConfig } from '../plugin-config'
import { MemoryFileSystem } from './memory-file-system'

const Schema = Type.Object({
  'server.url': Type.String({ default: 'https://vault.example' }),
  'sync.intervalMinutes': Type.Integer({ default: 5, deviceLocal: true }),
  'ui.theme': Type.String({ default: 'default' }),
})

const PATH = 'config.toml'

function silentLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  }
  return logger
}

function keysOf(fs: MemoryFileSystem): string[] {
  const text = fs.text(PATH)
  return text === undefined ? [] : Object.keys(parse(text)).sort()
}

describe('the annotation', () => {
  it('names only the properties that carry it', () => {
    expect([...deviceLocalKeys(Schema)]).toEqual(['sync.intervalMinutes'])
    expect(deviceLocalKeys(Type.Object({ a: Type.String() })).size).toBe(0)
  })

  it('splits a value object along the same line', () => {
    const split = splitConfig(deviceLocalKeys(Schema), { 'server.url': 'x', 'sync.intervalMinutes': 9 })
    expect(split).toEqual({ synced: { 'server.url': 'x' }, device: { 'sync.intervalMinutes': 9 } })
  })

  it('gives each file the half of the schema it owns, so neither defaults the other half', () => {
    const keys = deviceLocalKeys(Schema)
    expect(Object.keys(pickSchema(Schema, (key) => keys.has(key)).properties)).toEqual(['sync.intervalMinutes'])
    expect(Object.keys(pickSchema(Schema, (key) => !keys.has(key)).properties)).toEqual(['server.url', 'ui.theme'])
  })
})

describe('mergeConfig', () => {
  const keys = new Set(['interval'])

  it('lets the owning file win when both carry the key', () => {
    expect(mergeConfig(keys, { interval: 30, url: 'synced' }, { interval: 5, url: 'device' })).toEqual({
      interval: 5,
      url: 'synced',
    })
  })

  it('falls back to the other file only when the owner is silent — the seed that makes a moved key a migration', () => {
    expect(mergeConfig(keys, { interval: 30, url: 'synced' }, {})).toEqual({ interval: 30, url: 'synced' })
    expect(mergeConfig(keys, {}, { interval: 5, url: 'device' })).toEqual({ interval: 5, url: 'device' })
  })

  it('keeps a falsy value of the owner rather than reading it as absent', () => {
    expect(mergeConfig(keys, { interval: 30 }, { interval: 0 })).toEqual({ interval: 0 })
  })
})

describe('PluginConfig over two files', () => {
  let storage: MemoryFileSystem
  let state: MemoryFileSystem
  let config: PluginConfig

  beforeEach(() => {
    storage = new MemoryFileSystem()
    state = new MemoryFileSystem()
    config = new PluginConfig(storage, silentLogger(), state)
  })

  it('writes each key to its own file and nothing to the other', async () => {
    await config.write(Schema, { 'server.url': 'https://vault.test', 'sync.intervalMinutes': 30, 'ui.theme': 'slate' })

    expect(keysOf(storage)).toEqual(['server.url', 'ui.theme'])
    expect(keysOf(state)).toEqual(['sync.intervalMinutes'])
  })

  it('reads the two files back as one object', async () => {
    await config.write(Schema, { 'server.url': 'https://vault.test', 'sync.intervalMinutes': 30, 'ui.theme': 'slate' })

    expect(await config.read(Schema)).toEqual({
      'server.url': 'https://vault.test',
      'sync.intervalMinutes': 30,
      'ui.theme': 'slate',
    })
  })

  it('with no device file yet, seeds a device key from the synced file and defaults the rest', async () => {
    storage.seed(PATH, '"server.url" = "https://vault.test"\n"sync.intervalMinutes" = 30\n')

    expect(await config.read(Schema)).toEqual({
      'server.url': 'https://vault.test',
      // The value the vault still carries from before the key moved — not the schema default, which
      // would silently reset every device the first time it read the new layout.
      'sync.intervalMinutes': 30,
      'ui.theme': 'default',
    })
  })

  it('with neither file, answers the schema defaults', async () => {
    expect(await config.read(Schema)).toEqual({
      'server.url': 'https://vault.example',
      'sync.intervalMinutes': 5,
      'ui.theme': 'default',
    })
  })

  it('lets the owning file win when the same key sits in both', async () => {
    storage.seed(PATH, '"server.url" = "https://synced"\n"sync.intervalMinutes" = 30\n')
    state.seed(PATH, '"server.url" = "https://device"\n"sync.intervalMinutes" = 5\n')

    const values = await config.read(Schema)
    expect(values['sync.intervalMinutes']).toBe(5)
    expect(values['server.url']).toBe('https://synced')
  })

  it('leaves the device file alone when the synced write fails, so the section does not half-apply', async () => {
    state.seed(PATH, '"sync.intervalMinutes" = 30\n')
    storage.failWriteOn = PATH

    await expect(config.write(Schema, { 'server.url': 'https://vault.test', 'sync.intervalMinutes': 5 })).rejects.toThrow()

    expect(parse(state.text(PATH) ?? '')).toEqual({ 'sync.intervalMinutes': 30 })
    expect(storage.text(PATH)).toBeUndefined()
  })

  it('rolls a device file that did not exist back to not existing', async () => {
    storage.failWriteOn = PATH

    await expect(config.write(Schema, { 'sync.intervalMinutes': 5 })).rejects.toThrow()

    expect(state.text(PATH)).toBeUndefined()
  })

  it('touches only the synced file when the schema declares no device-local key', async () => {
    const SyncedOnly = Type.Object({ 'server.url': Type.String({ default: 'https://vault.example' }) })

    await config.write(SyncedOnly, { 'server.url': 'https://vault.test' })

    expect(keysOf(storage)).toEqual(['server.url'])
    expect(state.text(PATH)).toBeUndefined()
  })
})

describe('PluginConfig with no device view', () => {
  it('keeps every key in the synced file, which is what it did before the split', async () => {
    const storage = new MemoryFileSystem()
    const config = new PluginConfig(storage, silentLogger())

    await config.write(Schema, { 'sync.intervalMinutes': 30 })

    expect(keysOf(storage)).toEqual(['server.url', 'sync.intervalMinutes', 'ui.theme'])
    expect((await config.read(Schema))['sync.intervalMinutes']).toBe(30)
  })
})
