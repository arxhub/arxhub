import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAppError } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import { ensureWritableDir, readDisabledPlugins, readMaintenance, readPort, refuseUnknownPlugins } from '../read-env'

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    if (isAppError(error)) return error.body.message
    throw error
  }
  throw new Error('expected a refusal')
}

describe('readMaintenance', () => {
  it('is off when unset or empty, and reads the four spellings', () => {
    expect(readMaintenance(undefined)).toBe(false)
    expect(readMaintenance('')).toBe(false)
    expect(readMaintenance('0')).toBe(false)
    expect(readMaintenance('false')).toBe(false)
    expect(readMaintenance('1')).toBe(true)
    expect(readMaintenance('true')).toBe(true)
    expect(readMaintenance(' TRUE ')).toBe(true)
  })

  it('refuses anything else, naming the value', () => {
    expect(message(() => readMaintenance('yes'))).toContain("'yes'")
    expect(message(() => readMaintenance('on'))).toContain('ARXHUB_MAINTENANCE')
  })
})

describe('readDisabledPlugins', () => {
  it('splits a comma list and drops the blanks', () => {
    expect(readDisabledPlugins(undefined)).toEqual([])
    expect(readDisabledPlugins(' PublishServer, SyncServer ,, ')).toEqual(['PublishServer', 'SyncServer'])
  })
})

describe('refuseUnknownPlugins', () => {
  // The real roster of the headless server: a manifest name is not the class name, which is exactly the
  // mistake this refusal exists to catch.
  const known = ['@arxhub/plugin-gateway', 'ProtectionServer', 'VfsHttpServer', 'SyncServer', 'PublishServer']

  it('lets a list of known names through', () => {
    expect(() => refuseUnknownPlugins(['SyncServer'], known)).not.toThrow()
    expect(() => refuseUnknownPlugins([], known)).not.toThrow()
  })

  it('refuses an unknown name and says which names exist', () => {
    const [refused, offered] = message(() => refuseUnknownPlugins(['SyncServerPlugin', 'PublishServer'], known)).split('; the names are ')
    expect(refused).toContain("'SyncServerPlugin'")
    // The half of the list that IS registered is not reported as a mistake — only the misspelling is.
    expect(refused).not.toContain("'PublishServer'")
    for (const name of known) expect(offered).toContain(name)
  })
})

describe('readPort', () => {
  it('defaults to 3000 and reads an integer', () => {
    expect(readPort(undefined)).toBe(3000)
    expect(readPort(' ')).toBe(3000)
    expect(readPort('8080')).toBe(8080)
  })

  it('refuses anything that is not a port, naming the value', () => {
    expect(message(() => readPort('80a'))).toContain("'80a'")
    expect(message(() => readPort('70000'))).toContain('ARXHUB_PORT')
    expect(message(() => readPort('0'))).toContain("'0'")
  })
})

describe('ensureWritableDir', () => {
  it('creates a missing directory, parents included', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arxhub-env-'))
    await expect(ensureWritableDir(join(root, 'a', 'b'))).resolves.toBeUndefined()
    await expect(ensureWritableDir(join(root, 'a', 'b'))).resolves.toBeUndefined()
  })

  it('refuses a path that cannot be a directory, naming it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'arxhub-env-'))
    const file = join(root, 'not-a-dir')
    await writeFile(file, '')
    const path = join(file, 'data')
    await expect(ensureWritableDir(path)).rejects.toSatisfy((error: unknown) => isAppError(error) && error.body.message.includes(path))
  })
})
