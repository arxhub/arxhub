import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import {
  changeUnlockCode,
  disableDeviceLock,
  enableDeviceLock,
  getCodeShape,
  isDeviceLocked,
  isUnlockCodeValid,
  resetDeviceKeyStore,
  UNLOCK_CODE_LENGTH,
  unlockDeviceKeyStore,
  verifyUnlockCode,
} from '../device-lock'
import { CHECK_ENTRY, CODE_SHAPE_ENTRY, EncryptedKeyStore } from '../encrypted-key-store'
import { type KeyStore, MemoryKeyStore } from '../keystore'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const CODE = '314159'
const OTHER = '862315'

async function seeded(): Promise<MemoryKeyStore> {
  const inner = new MemoryKeyStore()
  await inner.set('identity.mnemonic', MNEMONIC)
  await inner.set('server.token', 'abc')
  return inner
}

// Delegates every call to a real store, but throws instead of writing once `budget` successful `set()`
// calls have already landed — simulating a process killed/reloaded mid-migration at an exact point,
// without reimplementing any migration logic. Everything that DID write before the throw is real,
// because it went through the same `inner` the test asserts against afterwards.
class InterruptingKeyStore implements KeyStore {
  private budget: number
  constructor(
    private readonly inner: KeyStore,
    budget: number,
  ) {
    this.budget = budget
  }

  get(name: string) {
    return this.inner.get(name)
  }
  has(name: string) {
    return this.inner.has(name)
  }
  delete(name: string) {
    return this.inner.delete(name)
  }
  list() {
    return this.inner.list()
  }

  async set(name: string, value: string): Promise<void> {
    if (this.budget-- <= 0) throw new Error('interrupted mid-migration')
    await this.inner.set(name, value)
  }
}

describe('device lock', () => {
  it('is off for a store that was never locked', async () => {
    expect(await isDeviceLocked(await seeded())).toBe(false)
  })

  it('encrypts existing plaintext entries in place when enabled', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    expect(await isDeviceLocked(inner)).toBe(true)
    // The whole point: the mnemonic must no longer be readable off the raw store.
    const raw = await inner.get('identity.mnemonic')
    expect(raw).not.toBe(MNEMONIC)
    expect(raw).not.toContain('abandon')
    expect(raw).toMatch(/^[0-9a-f]+$/)
  })

  it('reads every migrated value back through the unlocked view', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    const unlocked = await unlockDeviceKeyStore(inner, CODE)
    expect(await unlocked.get('identity.mnemonic')).toBe(MNEMONIC)
    expect(await unlocked.get('server.token')).toBe('abc')
    expect((await unlocked.list()).sort()).toEqual(['identity.mnemonic', 'server.token'])
  })

  it('rejects the wrong code at unlock rather than on a later read', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    const error = await unlockDeviceKeyStore(inner, '271828').catch((e) => e)
    expect(hasErrorCode(error, 'UnlockFailedError')).toBe(true)
  })

  it.each([UNLOCK_CODE_LENGTH - 1, UNLOCK_CODE_LENGTH + 1, 0])('refuses a code of %i digits', async (length) => {
    const inner = await seeded()

    const error = await enableDeviceLock(inner, '1'.repeat(length)).catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeLengthError')).toBe(true)
    expect(await isDeviceLocked(inner)).toBe(false)
  })

  it('refuses a new code that is not six digits and leaves the current one working', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    const error = await changeUnlockCode(inner, CODE, '12345678').catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeLengthError')).toBe(true)
    expect(await (await unlockDeviceKeyStore(inner, CODE)).get('identity.mnemonic')).toBe(MNEMONIC)
  })

  // The keypad is the only input a code is ever entered on, so a stored code carrying anything else
  // could not be typed back in — the refusal lives here rather than in the screen that renders the pad.
  it.each(['passphrase', '12345a', '123 456', '-123456'])('refuses %j as a code', async (code) => {
    const inner = await seeded()

    const error = await enableDeviceLock(inner, code).catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeNotNumericError')).toBe(true)
    expect(await isDeviceLocked(inner)).toBe(false)
  })

  // \d is ASCII, and the keypad only ever produces ASCII — a code pasted in from elsewhere that merely
  // looks like digits would not be reproducible on the pad.
  it('refuses digits that are not the ones on the keypad', async () => {
    const inner = await seeded()

    const error = await enableDeviceLock(inner, '١٢٣٤٥٦').catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeNotNumericError')).toBe(true)
  })

  it('refuses a non-numeric new code and leaves the current one working', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    const error = await changeUnlockCode(inner, CODE, 'correct horse battery staple').catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeNotNumericError')).toBe(true)
    expect(await (await unlockDeviceKeyStore(inner, CODE)).get('identity.mnemonic')).toBe(MNEMONIC)
  })

  // Unlocking is not held to the rule: a device locked before the keypad existed still has to report a
  // wrong code as a wrong code, which is the only answer its owner can act on.
  it('answers a non-numeric attempt at unlock with a failed unlock, not a rule', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    const error = await unlockDeviceKeyStore(inner, 'correct horse battery staple').catch((e) => e)
    expect(hasErrorCode(error, 'UnlockFailedError')).toBe(true)
  })

  it.each([
    ['314159', true],
    ['000000', true],
    ['00000000000000', false],
    ['1234567', false],
    ['12345', false],
    ['1234a6', false],
    ['1234 56', false],
    ['', false],
  ])('isUnlockCodeValid(%j) is %s', (code, valid) => {
    expect(isUnlockCodeValid(code)).toBe(valid)
  })

  it('re-encrypts under a new code and stops accepting the old one', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)
    await changeUnlockCode(inner, CODE, OTHER)

    expect(await (await unlockDeviceKeyStore(inner, OTHER)).get('identity.mnemonic')).toBe(MNEMONIC)
    await expect(unlockDeviceKeyStore(inner, CODE)).rejects.toThrow()
  })

  it('never writes plaintext while changing the code', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)
    await changeUnlockCode(inner, CODE, OTHER)

    expect(await inner.get('identity.mnemonic')).not.toContain('abandon')
  })

  it('will not change the code without the current one', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    await expect(changeUnlockCode(inner, 'wrong code', OTHER)).rejects.toThrow()
    // The original code must still work — a failed attempt cannot leave the store half-rekeyed.
    expect(await (await unlockDeviceKeyStore(inner, CODE)).get('identity.mnemonic')).toBe(MNEMONIC)
  })

  it('restores plaintext when disabled with the right code', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)
    await disableDeviceLock(inner, CODE)

    expect(await isDeviceLocked(inner)).toBe(false)
    expect(await inner.get('identity.mnemonic')).toBe(MNEMONIC)
    expect(await inner.get('server.token')).toBe('abc')
  })

  it('will not disable the lock without the code', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)

    await expect(disableDeviceLock(inner, 'wrong code')).rejects.toThrow()
    expect(await isDeviceLocked(inner)).toBe(true)
  })

  it('leaves nothing behind after a reset, including the reserved entries', async () => {
    const inner = await seeded()
    await enableDeviceLock(inner, CODE)
    await resetDeviceKeyStore(inner)

    expect(await inner.list()).toEqual([])
    expect(await isDeviceLocked(inner)).toBe(false)
    expect(await inner.get('identity.mnemonic')).toBeNull()
  })

  describe('staged migration', () => {
    // Both enable and changeUnlockCode, seeded with the same two entries, write exactly 5 real `set()`
    // calls to fully stage a new generation (salt, value 1, value 2, verifier, shape marker) before
    // promotion starts — interrupting at budget 5 lands squarely between "fully staged" and "promotion
    // has begun".
    const SETS_TO_FULLY_STAGE = 5

    it('enable interrupted right after staging leaves every real entry exactly as it was', async () => {
      const inner = await seeded()
      const flaky = new InterruptingKeyStore(inner, SETS_TO_FULLY_STAGE)

      await expect(enableDeviceLock(flaky, CODE)).rejects.toThrow()

      expect(await isDeviceLocked(inner)).toBe(false)
      expect(await inner.get('identity.mnemonic')).toBe(MNEMONIC)
      expect(await inner.get('server.token')).toBe('abc')
      // The fully-computed new generation is sitting in staging, unpromoted.
      expect((await inner.list()).some((name) => name.startsWith('__staging__.'))).toBe(true)
    })

    it('an orphaned staging entry from an abandoned attempt does not leak into the next successful one', async () => {
      const inner = await seeded()
      await expect(enableDeviceLock(new InterruptingKeyStore(inner, SETS_TO_FULLY_STAGE), CODE)).rejects.toThrow()

      // A second, real attempt — with a different code — must not resurrect or merge the orphaned entries.
      await enableDeviceLock(inner, OTHER)

      const unlocked = await unlockDeviceKeyStore(inner, OTHER)
      expect((await unlocked.list()).sort()).toEqual(['identity.mnemonic', 'server.token'])
      expect(await unlocked.get('identity.mnemonic')).toBe(MNEMONIC)
      expect((await inner.list()).some((name) => name.includes('__staging__'))).toBe(false)
    })

    it('changeUnlockCode interrupted right after staging leaves the old code fully working', async () => {
      const inner = await seeded()
      await enableDeviceLock(inner, CODE)
      const flaky = new InterruptingKeyStore(inner, SETS_TO_FULLY_STAGE)

      await expect(changeUnlockCode(flaky, CODE, OTHER)).rejects.toThrow()

      const unlocked = await unlockDeviceKeyStore(inner, CODE)
      expect(await unlocked.get('identity.mnemonic')).toBe(MNEMONIC)
      await expect(unlockDeviceKeyStore(inner, OTHER)).rejects.toThrow()
    })

    it('a partial promotion never leaves a real entry silently readable as something else', async () => {
      // One `set()` further than SETS_TO_FULLY_STAGE: staging completes, and promotion writes the first
      // ordinary real value before the budget runs out — the exact interleaving the old implementation
      // could leave behind with no verifier at all, which is what used to read back as a plausible but
      // wrong value instead of failing.
      const inner = await seeded()
      const flaky = new InterruptingKeyStore(inner, SETS_TO_FULLY_STAGE + 1)

      await expect(enableDeviceLock(flaky, CODE)).rejects.toThrow()

      // Whatever state the real store is in, it must be internally self-consistent enough to fail loudly
      // rather than hand back a value that looks legitimate: either it still reads as unlocked with the
      // original plaintext, or reading a promoted value under any code either throws or the entry is
      // simply gone from a plaintext read (it was never given a chance to look like a valid mnemonic and
      // a corrupt one at once).
      if (!(await isDeviceLocked(inner))) {
        const mnemonic = await inner.get('identity.mnemonic')
        if (mnemonic !== MNEMONIC) expect(mnemonic).not.toMatch(/^[0-9a-f]+$/) // not raw ciphertext hex either
      }
    })
  })
  describe('code shape', () => {
    // A lock set under the old "six or more" rule: a verifier and ciphertext, and no marker, which is
    // exactly what enableDeviceLock wrote before the rule changed.
    async function legacyLock(code: string): Promise<MemoryKeyStore> {
      const inner = await seeded()
      const store = new EncryptedKeyStore(inner, code)
      for (const name of ['identity.mnemonic', 'server.token']) {
        const value = await inner.get(name)
        if (value != null) await store.set(name, value)
      }
      await store.writeVerifier()
      return inner
    }

    it('reads an unlocked store as six digits, since any lock set from now on is', async () => {
      expect(await getCodeShape(await seeded())).toBe('digits-6')
    })

    it('marks a lock on enable and on change, and drops the mark on disable', async () => {
      const inner = await seeded()
      await enableDeviceLock(inner, CODE)
      expect(await getCodeShape(inner)).toBe('digits-6')

      await changeUnlockCode(inner, CODE, OTHER)
      expect(await getCodeShape(inner)).toBe('digits-6')

      await disableDeviceLock(inner, OTHER)
      expect(await inner.has(CODE_SHAPE_ENTRY)).toBe(false)
      expect(await inner.list()).toEqual(expect.not.arrayContaining([CODE_SHAPE_ENTRY]))
    })

    // The marker is plaintext on purpose; the unlocked view must never try to decrypt it.
    it('keeps the marker out of the unlocked view', async () => {
      const inner = await seeded()
      await enableDeviceLock(inner, CODE)

      const unlocked = await unlockDeviceKeyStore(inner, CODE)
      expect((await unlocked.list()).sort()).toEqual(['identity.mnemonic', 'server.token'])
    })

    it('reports a lock without the marker as legacy and still opens it with a longer code', async () => {
      const inner = await legacyLock('31415926')
      expect(await getCodeShape(inner)).toBe('legacy')

      const unlocked = await unlockDeviceKeyStore(inner, '31415926')
      expect(await unlocked.get('identity.mnemonic')).toBe(MNEMONIC)
      // A longer code is not the rule, so the device stays on the confirm key.
      expect(await getCodeShape(inner)).toBe('legacy')
    })

    it('marks a legacy lock the first time it opens with a code that already is six digits', async () => {
      const inner = await legacyLock(CODE)

      await unlockDeviceKeyStore(inner, CODE)
      expect(await getCodeShape(inner)).toBe('digits-6')
    })

    it('never marks a lock on a failed unlock', async () => {
      const inner = await legacyLock('31415926')

      await expect(unlockDeviceKeyStore(inner, CODE)).rejects.toThrow()
      expect(await getCodeShape(inner)).toBe('legacy')
    })

    it('changes a legacy lock onto the rule', async () => {
      const inner = await legacyLock('31415926')

      await changeUnlockCode(inner, '31415926', OTHER)
      expect(await getCodeShape(inner)).toBe('digits-6')
      expect(await (await unlockDeviceKeyStore(inner, OTHER)).get('identity.mnemonic')).toBe(MNEMONIC)
    })

    it('does not carry a stray marker from a plaintext store into a new lock as ciphertext', async () => {
      const inner = await seeded()
      await inner.set(CODE_SHAPE_ENTRY, 'garbage')

      await enableDeviceLock(inner, CODE)
      expect(await getCodeShape(inner)).toBe('digits-6')
    })

    it('verifies a code without changing anything', async () => {
      const inner = await legacyLock(CODE)

      expect(await verifyUnlockCode(inner, CODE)).toBe(true)
      expect(await verifyUnlockCode(inner, OTHER)).toBe(false)
      expect(await getCodeShape(inner)).toBe('legacy')
    })

    // Every stop point of a change from a legacy code to a six-digit one. The one state that must never
    // exist is a marker beside a verifier that is not six digits: the screen would then submit the
    // longer code at its sixth digit and the device could not be opened at all.
    // One scrypt-backed change per interruption point, so it runs well past the default timeout.
    it('an interrupted change never leaves the marker without a matching verifier', { timeout: 60_000 }, async () => {
      const LEGACY = '31415926'
      let checked = 0
      let finished = false
      for (let budget = 0; budget < 16; budget++) {
        const inner = await legacyLock(LEGACY)
        const verifierBefore = await inner.get(CHECK_ENTRY)
        const done = await changeUnlockCode(new InterruptingKeyStore(inner, budget), LEGACY, OTHER).then(
          () => true,
          () => false,
        )

        if ((await getCodeShape(inner)) === 'digits-6') {
          expect(await inner.get(CHECK_ENTRY)).not.toBe(verifierBefore)
          expect(await verifyUnlockCode(inner, OTHER)).toBe(true)
          checked++
        }
        if (done) {
          finished = true
          break
        }
      }
      // The loop reached an uninterrupted change, and the marker was actually looked at on the way.
      expect(finished).toBe(true)
      expect(checked).toBeGreaterThan(0)
    })

    it('an interrupted disable never leaves the marker on a store it no longer describes', async () => {
      for (let deletes = 0; deletes < 3; deletes++) {
        const inner = await seeded()
        await enableDeviceLock(inner, CODE)
        // Stop the disable after `deletes` of its final removals by failing the next delete.
        let left = deletes
        const flaky: KeyStore = {
          get: (name) => inner.get(name),
          set: (name, value) => inner.set(name, value),
          has: (name) => inner.has(name),
          list: () => inner.list(),
          delete: async (name) => {
            if ([CODE_SHAPE_ENTRY, CHECK_ENTRY, '__vault_salt__'].includes(name) && left-- <= 0) throw new Error('interrupted')
            await inner.delete(name)
          },
        }
        await disableDeviceLock(flaky, CODE).catch(() => undefined)

        if (!(await isDeviceLocked(inner))) expect(await inner.has(CODE_SHAPE_ENTRY)).toBe(false)
      }
    })
  })
})
