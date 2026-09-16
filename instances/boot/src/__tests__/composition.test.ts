import { isAppError } from '@arxhub/errors'
import { describe, expect, test } from 'vitest'
import { CLIENT_COMPOSITION, type CompositionRules, checkComposition, type RegisteredPlugin, SERVER_COMPOSITION } from '../composition'

// The client list an instance's register() really produces, in registration order.
const CLIENT_ROSTER: RegisteredPlugin[] = [
  { name: 'Vfs', essential: true },
  { name: 'Logger', essential: true },
  { name: 'Config', essential: true },
  { name: 'Hotkeys', essential: true },
  { name: 'Shell', essential: true },
  { name: 'Panels', essential: true },
  { name: 'Notes', essential: true },
  { name: 'Explorer', essential: false },
  { name: 'CodeMirror', essential: false },
  { name: 'Preview', essential: false },
  { name: 'ArxEditor', essential: false },
  { name: 'ArxSheets', essential: false },
  { name: 'settings', essential: true },
  { name: 'search', essential: false },
  { name: 'theme', essential: false },
  { name: 'keystore', essential: true },
  { name: 'protection', essential: true },
  { name: 'maintenance', essential: true },
  { name: 'Repository', essential: true },
  { name: 'sync', essential: false },
  { name: 'publish', essential: false },
]

const SERVER_ROSTER: RegisteredPlugin[] = [
  { name: '@arxhub/plugin-gateway', essential: true },
  { name: 'ProtectionServer', essential: true },
  { name: 'VfsHttpServer', essential: false },
  { name: 'SyncServer', essential: false },
  { name: 'PublishServer', essential: false },
]

const without = (name: string): RegisteredPlugin[] => CLIENT_ROSTER.filter((it) => it.name !== name)

const problems = (plugins: RegisteredPlugin[], rules: CompositionRules = CLIENT_COMPOSITION): string => {
  try {
    checkComposition(plugins, rules)
  } catch (error) {
    if (!isAppError(error)) throw error
    return error.body.message
  }
  return ''
}

describe('checkComposition', () => {
  test('accepts the lists the instances actually register', () => {
    expect(() => checkComposition(CLIENT_ROSTER, CLIENT_COMPOSITION)).not.toThrow()
    expect(() => checkComposition(SERVER_ROSTER, SERVER_COMPOSITION)).not.toThrow()
  })

  test('names the essential plugin nobody registered', () => {
    expect(problems(without('Notes'))).toContain("'Notes' is missing")
  })

  test('refuses a name registered twice', () => {
    expect(problems([...CLIENT_ROSTER, { name: 'theme', essential: false }])).toContain("'theme' is registered twice")
  })

  test('refuses sync ahead of the repository it is layered over', () => {
    const swapped = without('sync')
    swapped.splice(
      swapped.findIndex((it) => it.name === 'Repository'),
      0,
      { name: 'sync', essential: false },
    )

    expect(problems(swapped)).toContain("'Repository' must be registered before 'sync'")
  })

  test('says nothing about an order pair whose optional half is not registered', () => {
    expect(problems(without('sync'))).toBe('')
  })

  test('catches a list that fell behind a manifest newly marked essential', () => {
    const plugins = [...CLIENT_ROSTER, { name: 'chronicle', essential: true }]

    expect(problems(plugins)).toContain("'chronicle' declares itself essential but the client list does not require it")
  })

  test('reports everything wrong at once', () => {
    const message = problems(without('Notes').filter((it) => it.name !== 'keystore'))

    expect(message).toContain("'Notes' is missing")
    expect(message).toContain("'keystore' is missing")
  })

  test('fails as an application error a composition root can recognise', () => {
    try {
      checkComposition(without('Shell'), CLIENT_COMPOSITION)
      expect.unreachable('a missing essential plugin must not boot')
    } catch (error) {
      if (!isAppError(error)) throw error
      expect(error.body.code).toBe('BootCompositionError')
      expect(error.body.statusCode).toBe(500)
    }
  })

  test('holds a client roster to the client rules only', () => {
    expect(problems(SERVER_ROSTER)).toContain("'Vfs' is missing")
  })
})
