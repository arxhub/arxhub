import { ExtensionContainer } from '@arxhub/core'
import type { Logger } from '@arxhub/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, ThemeExtension } from '../theme-extension'

function silentLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  }
  return logger
}

let attributes: Record<string, string>
let themes: ThemeExtension

beforeEach(() => {
  attributes = {}
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value
      },
    },
  })
  const extensions = new ExtensionContainer({ logger: silentLogger() })
  extensions.register(ThemeExtension)
  themes = extensions.get(ThemeExtension)
  themes.register({ id: 'default', title: 'Default', base: 'light' }, { id: 'slate', title: 'Slate', base: 'dark' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ThemeExtension.apply — the record the boot script reads', () => {
  it('writes the applied theme id and base under arxhub.theme', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => store.set(key, value) })

    themes.apply('slate')

    expect(THEME_STORAGE_KEY).toBe('arxhub.theme')
    expect(JSON.parse(store.get('arxhub.theme') ?? 'null')).toEqual({ id: 'slate', base: 'dark' })

    themes.apply('default')
    expect(JSON.parse(store.get('arxhub.theme') ?? 'null')).toEqual({ id: 'default', base: 'light' })
  })

  it('still applies the theme when storage throws', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })

    expect(() => themes.apply('slate')).not.toThrow()
    expect(themes.activeId.value).toBe('slate')
    expect(attributes).toEqual({ 'data-arxhub-theme': 'slate', 'data-theme': 'dark' })
  })

  it('writes nothing for a theme nobody registered', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })

    themes.apply('nope')

    expect(setItem).not.toHaveBeenCalled()
  })
})
