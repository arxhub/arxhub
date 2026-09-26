import { describe, expect, it } from 'vitest'
import { normalizeServerAddress } from '../entry/server-check'
import { serverStatusLine } from '../entry/server-status-line'

describe('normalizeServerAddress', () => {
  it.each([
    ['https://hub.example.com', 'https://hub.example.com'],
    ['https://hub.example.com/', 'https://hub.example.com'],
    ['  hub.example.com  ', 'https://hub.example.com'],
    ['HTTPS://Hub.Example.com', 'https://hub.example.com'],
    ['http://localhost:3001', 'http://localhost:3001'],
    ['192.168.1.10:3000', 'https://192.168.1.10:3000'],
  ])('reads %s as %s', (text, origin) => {
    expect(normalizeServerAddress(text)).toBe(origin)
  })

  it.each([
    '',
    '   ',
    'https://hub.example.com/api',
    'https://hub.example.com?x=1',
    'ftp://hub.example.com',
    'https://user@hub.example.com',
    'http://',
  ])('refuses %s', (text) => {
    expect(normalizeServerAddress(text)).toBeNull()
  })
})

describe('serverStatusLine', () => {
  it('says nothing before a check', () => {
    expect(serverStatusLine({ kind: 'idle' }, 'new')).toBeNull()
  })

  it('reads an empty server as the start of a new vault, and as a warning when joining one', () => {
    const empty = { kind: 'found', summary: { empty: true } } as const
    expect(serverStatusLine(empty, 'new')).toEqual({ tone: 'success', text: 'Server responds · vault is empty' })
    expect(serverStatusLine(empty, 'join')).toEqual({ tone: 'warning', text: 'No vault for this phrase on this server yet' })
  })

  it('counts what a found vault holds', () => {
    const found = { kind: 'found', summary: { empty: false, documents: 1248, bytes: 3.2 * 1024 ** 3 } } as const
    expect(serverStatusLine(found, 'join')?.text).toBe('Vault found · 1,248 documents · 3.2 GB')
    expect(serverStatusLine({ kind: 'found', summary: { empty: false, documents: 1, bytes: 10 } }, 'join')?.text).toBe(
      'Vault found · 1 document · 10 B',
    )
  })

  it('tells a pin, a clock and a silence apart', () => {
    expect(serverStatusLine({ kind: 'other-vault' }, 'new')?.text).toBe('This server belongs to another vault')
    expect(serverStatusLine({ kind: 'refused', reason: 'stale' }, 'new')?.text).toBe(
      "The server refused this device — check this device's clock",
    )
    expect(serverStatusLine({ kind: 'unreachable' }, 'new')?.text).toBe('The server did not respond — check the address')
    expect(serverStatusLine({ kind: 'checking' }, 'new')).toEqual({ tone: 'neutral', text: 'Checking…', pending: true })
  })
})
