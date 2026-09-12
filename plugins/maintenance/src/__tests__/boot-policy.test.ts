import { beforeEach, describe, expect, test } from 'vitest'
import { BOOT_POLICY_KEY, BootPolicy, type StorageLike } from '../boot-policy'

class MemoryStorage implements StorageLike {
  readonly entries = new Map<string, string>()

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value)
  }
  removeItem(key: string): void {
    this.entries.delete(key)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('BootPolicy', () => {
  test('keeps the renamed ArxEditor disabled until explicitly enabled', () => {
    storage.setItem(BOOT_POLICY_KEY, JSON.stringify({ disabled: ['Editor', 'ArxEditor', 'sync'], maintenance: false }))
    const policy = new BootPolicy(storage)
    expect(policy.disabled).toEqual(['ArxEditor', 'sync'])
    expect(policy.isDisabled('ArxEditor')).toBe(true)
    policy.setEnabled('ArxEditor', true)
    expect(new BootPolicy(storage).disabled).toEqual(['sync'])
  })

  test('boots everything when nothing was ever stored', () => {
    const policy = new BootPolicy(storage)

    expect(policy.disabled).toEqual([])
    expect(policy.maintenance).toBe(false)
  })

  test('a switch survives into the next boot', () => {
    new BootPolicy(storage).setEnabled('sync', false)

    expect(new BootPolicy(storage).disabled).toEqual(['sync'])
  })

  test('switching a plugin back on removes it', () => {
    const policy = new BootPolicy(storage)
    policy.setEnabled('sync', false)
    policy.setEnabled('sync', true)

    expect(new BootPolicy(storage).disabled).toEqual([])
  })

  test('disabling twice does not duplicate the entry', () => {
    const policy = new BootPolicy(storage)
    policy.setEnabled('sync', false)
    policy.setEnabled('sync', false)

    expect(policy.disabled).toEqual(['sync'])
  })

  test('maintenance mode round-trips', () => {
    new BootPolicy(storage).setMaintenance(true)

    expect(new BootPolicy(storage).maintenance).toBe(true)
  })

  test('clear() goes back to booting everything', () => {
    const policy = new BootPolicy(storage)
    policy.setEnabled('sync', false)
    policy.setMaintenance(true)
    policy.clear()

    expect(policy.disabled).toEqual([])
    expect(policy.maintenance).toBe(false)
    expect(storage.getItem(BOOT_POLICY_KEY)).toBeNull()
  })

  // The one file that must never be the reason the app won't start.
  test('a corrupt entry falls back to booting everything instead of throwing', () => {
    storage.setItem(BOOT_POLICY_KEY, '{not json')

    expect(new BootPolicy(storage).disabled).toEqual([])
  })

  test('junk of the right shape is filtered, not trusted', () => {
    storage.setItem(BOOT_POLICY_KEY, JSON.stringify({ disabled: ['sync', 7, null], maintenance: 'yes' }))

    const policy = new BootPolicy(storage)

    expect(policy.disabled).toEqual(['sync'])
    expect(policy.maintenance).toBe(false)
  })
})
