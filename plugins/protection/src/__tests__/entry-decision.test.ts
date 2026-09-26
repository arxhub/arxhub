import { describe, expect, it } from 'vitest'
import { decideAfterUnlock, decideEntry, type EntrySituation } from '../entry/entry-decision'
import type { EntryRecord } from '../entry/entry-record'

const situation = (overrides: Partial<EntrySituation>): EntrySituation => ({
  locked: false,
  hasIdentity: false,
  record: null,
  requireLock: true,
  ...overrides,
})

const connect: EntryRecord = { v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' }
const join: EntryRecord = { v: 1, kind: 'join', serverUrl: 'https://hub.example.com', since: '2026-09-26T10:00:00Z' }

describe('decideEntry', () => {
  it('sends a device with no lock and no identity to the chooser, whatever the build', () => {
    expect(decideEntry(situation({ requireLock: true }))).toEqual({ kind: 'first-run' })
    expect(decideEntry(situation({ requireLock: false }))).toEqual({ kind: 'first-run' })
  })

  it('ignores a stale record on a device that holds nothing', () => {
    expect(decideEntry(situation({ record: connect }))).toEqual({ kind: 'first-run' })
  })

  it('asks a device from before the flow — identity in the clear — for a code on a shipped build', () => {
    expect(decideEntry(situation({ hasIdentity: true, requireLock: true }))).toEqual({ kind: 'setup-lock' })
  })

  it('boots a seeded dev identity straight away', () => {
    expect(decideEntry(situation({ hasIdentity: true, requireLock: false }))).toEqual({ kind: 'boot' })
    expect(decideEntry(situation({ hasIdentity: true, requireLock: false, record: connect }))).toEqual({ kind: 'boot' })
  })

  it('resumes a new vault the dev stand left mid-way rather than booting past its phrase', () => {
    expect(decideEntry(situation({ hasIdentity: true, requireLock: false, record: { v: 1, kind: 'new', step: 'check' } }))).toEqual({
      kind: 'resume',
      step: 'check',
    })
  })

  it('unlocks a locked device first, whatever the rest says', () => {
    expect(decideEntry(situation({ locked: true }))).toEqual({ kind: 'unlock' })
    expect(decideEntry(situation({ locked: true, record: { v: 1, kind: 'new', step: 'phrase' } }))).toEqual({ kind: 'unlock' })
    expect(decideEntry(situation({ locked: true, requireLock: false }))).toEqual({ kind: 'unlock' })
  })
})

describe('decideAfterUnlock', () => {
  it.each(['phrase', 'check', 'server'] as const)('resumes a new vault at %s', (step) => {
    expect(decideAfterUnlock({ hasIdentity: true, record: { v: 1, kind: 'new', step } })).toEqual({ kind: 'resume', step })
  })

  it('goes back to the chooser when the code exists but the identity does not', () => {
    expect(decideAfterUnlock({ hasIdentity: false, record: null })).toEqual({ kind: 'first-run' })
    expect(decideAfterUnlock({ hasIdentity: false, record: { v: 1, kind: 'new', step: 'phrase' } })).toEqual({ kind: 'first-run' })
    expect(decideAfterUnlock({ hasIdentity: false, record: join })).toEqual({ kind: 'first-run' })
  })

  it('boots, passing a connect or join record on', () => {
    expect(decideAfterUnlock({ hasIdentity: true, record: null })).toEqual({ kind: 'boot' })
    expect(decideAfterUnlock({ hasIdentity: true, record: connect })).toEqual({ kind: 'boot' })
    expect(decideAfterUnlock({ hasIdentity: true, record: join })).toEqual({ kind: 'boot' })
  })
})
