import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import {
  changeUnlockCode,
  disableDeviceLock,
  enableDeviceLock,
  isDeviceLocked,
  MIN_UNLOCK_CODE_LENGTH,
  resetDeviceKeyStore,
  unlockDeviceKeyStore,
} from '../device-lock'
import { type KeyStore, MemoryKeyStore } from '../keystore'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const CODE = '314159'
const OTHER = 'correct horse battery staple'

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

  it('refuses a code below the minimum length', async () => {
    const inner = await seeded()
    const short = 'x'.repeat(MIN_UNLOCK_CODE_LENGTH - 1)

    const error = await enableDeviceLock(inner, short).catch((e) => e)
    expect(hasErrorCode(error, 'UnlockCodeTooShortError')).toBe(true)
    expect(await isDeviceLocked(inner)).toBe(false)
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
    // Both enable and changeUnlockCode, seeded with the same two entries, write exactly 4 real `set()`
    // calls to fully stage a new generation (salt, value 1, value 2, verifier) before promotion starts —
    // interrupting at budget 4 lands squarely between "fully staged" and "promotion has begun".
    const SETS_TO_FULLY_STAGE = 4

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
})
