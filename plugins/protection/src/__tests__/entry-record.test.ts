import { describe, expect, it } from 'vitest'
import { ENTRY_RECORD_KEY, EntryRecordStore, parseEntryRecord } from '../entry/entry-record'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('parseEntryRecord', () => {
  it('reads each of the three shapes', () => {
    expect(parseEntryRecord('{"v":1,"kind":"new","step":"check"}')).toEqual({ v: 1, kind: 'new', step: 'check' })
    expect(parseEntryRecord('{"v":1,"kind":"connect","serverUrl":"https://a"}')).toEqual({ v: 1, kind: 'connect', serverUrl: 'https://a' })
    expect(parseEntryRecord('{"v":1,"kind":"join","serverUrl":"https://a","since":"t"}')).toEqual({
      v: 1,
      kind: 'join',
      serverUrl: 'https://a',
      since: 't',
    })
  })

  it.each([
    null,
    '',
    'not json',
    '[]',
    '{"v":2,"kind":"new","step":"phrase"}',
    '{"v":1,"kind":"new","step":"code"}',
    '{"v":1,"kind":"connect","serverUrl":""}',
    '{"v":1,"kind":"join","serverUrl":"https://a"}',
    '{"v":1,"kind":"other"}',
  ])('reads %s as no record', (raw) => {
    expect(parseEntryRecord(raw)).toBeNull()
  })

  it('drops fields it does not know, so nothing else rides along into the boot', () => {
    expect(parseEntryRecord('{"v":1,"kind":"new","step":"phrase","mnemonic":"x"}')).toEqual({ v: 1, kind: 'new', step: 'phrase' })
  })
})

describe('EntryRecordStore', () => {
  it('writes, reads back and clears under one key', () => {
    const storage = memoryStorage()
    const store = new EntryRecordStore(storage)

    store.write({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' })
    expect(storage.map.has(ENTRY_RECORD_KEY)).toBe(true)
    expect(store.read()).toEqual({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' })

    store.clear()
    expect(store.read()).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('works, holding nothing, where there is no Web Storage', () => {
    const store = new EntryRecordStore(null)
    store.write({ v: 1, kind: 'new', step: 'phrase' })
    expect(store.read()).toBeNull()
  })
})
