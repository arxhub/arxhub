import { describe, expect, it } from 'vitest'
import { decideIdentityChange, type IdentitySituation } from '../owner-decision'

const MINE = 'xpub-mine'
const THEIRS = 'xpub-theirs'
const OLD = 'xpub-old'

function situation(overrides: Partial<IdentitySituation> = {}): IdentitySituation {
  return { entered: THEIRS, current: MINE, previousOwner: MINE, vaultEmpty: false, ...overrides }
}

describe('decideIdentityChange', () => {
  it('asks nothing when the vault is empty — there is nothing to lose', () => {
    expect(decideIdentityChange(situation({ vaultEmpty: true }))).toEqual({ kind: 'nothing-to-lose' })
  })

  it('recognises this device’s own phrase instead of offering to replace it with itself', () => {
    expect(decideIdentityChange(situation({ entered: MINE }))).toEqual({ kind: 'already-this-device' })
  })

  it('treats the phrase the data on disk belongs to as a restore, not a handover', () => {
    // The reinstall / cleared-key-store case: a fresh random identity was minted, and the user is
    // typing the phrase that owns the files that are already here.
    const decision = decideIdentityChange(situation({ entered: OLD, current: MINE, previousOwner: OLD }))

    expect(decision).toEqual({ kind: 'restores-owner' })
  })

  it('asks the destructive question only for a stranger’s phrase over existing content', () => {
    expect(decideIdentityChange(situation({ entered: THEIRS, current: MINE, previousOwner: OLD }))).toEqual({ kind: 'foreign-owner' })
  })

  it('asks when nothing is recorded about the owner and the vault is not empty', () => {
    // An unknown owner is not a licence to skip the question — it is the reason to ask it.
    expect(decideIdentityChange(situation({ entered: THEIRS, previousOwner: null }))).toEqual({ kind: 'foreign-owner' })
  })

  it('answers "already this device" over "restores owner" when both would match', () => {
    // The device that never lost its key store: the marker names the identity that is running.
    expect(decideIdentityChange(situation({ entered: MINE, current: MINE, previousOwner: MINE }))).toEqual({
      kind: 'already-this-device',
    })
  })

  it('is a pure function of its inputs', () => {
    const input = situation()
    const snapshot = { ...input }

    decideIdentityChange(input)

    expect(input).toEqual(snapshot)
  })
})
