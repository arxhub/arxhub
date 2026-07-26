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
import { MemoryKeyStore } from '../keystore'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const CODE = '314159'
const OTHER = 'correct horse battery staple'

async function seeded(): Promise<MemoryKeyStore> {
  const inner = new MemoryKeyStore()
  await inner.set('identity.mnemonic', MNEMONIC)
  await inner.set('server.token', 'abc')
  return inner
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
})
