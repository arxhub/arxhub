import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickLanguage } from '../language'

describe('pickLanguage', () => {
  it('an explicit choice wins over the system', () => {
    expect(pickLanguage('en', ['ru-RU'])).toBe('en')
    expect(pickLanguage('ru', ['en-US'])).toBe('ru')
  })

  it('"system" takes Russian when the system lists a Russian tag, anywhere, else English', () => {
    expect(pickLanguage('system', ['ru-RU', 'en-US'])).toBe('ru')
    expect(pickLanguage('system', ['RU'])).toBe('ru')
    expect(pickLanguage('system', ['de-DE', 'ru'])).toBe('ru')
    expect(pickLanguage('system', ['en-GB'])).toBe('en')
    expect(pickLanguage('system', ['uk-UA'])).toBe('en')
    expect(pickLanguage(null, [])).toBe('en')
  })
})

interface World {
  stored?: string | null
  storageThrows?: boolean
  languages?: string[]
  lang?: string
}

async function boot(world: World) {
  const store = new Map<string, string>()
  if (world.stored != null) store.set('arxhub.language', world.stored)
  const attributes: Record<string, string> = world.lang ? { lang: world.lang } : {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (world.storageThrows) throw new Error('SecurityError')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (world.storageThrows) throw new Error('SecurityError')
      store.set(key, value)
    },
    removeItem: (key: string) => store.delete(key),
  })
  vi.stubGlobal('navigator', { languages: world.languages ?? ['en-US'], language: world.languages?.[0] ?? 'en-US' })
  vi.stubGlobal('document', {
    documentElement: {
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => (attributes[name] = value),
    },
  })
  vi.resetModules()
  const module = await import('../language')
  return { module, store, attributes }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('language on load', () => {
  it('takes <html lang> the pre-paint script set, over what it would compute', async () => {
    const { module } = await boot({ lang: 'ru', languages: ['en-US'] })
    expect(module.language.value).toBe('ru')
    expect(module.preference.value).toBe('system')
  })

  it('without a usable <html lang>, a stored choice, then the system', async () => {
    expect((await boot({ lang: 'de', stored: 'ru' })).module.language.value).toBe('ru')
    expect((await boot({ languages: ['ru-RU'] })).module.language.value).toBe('ru')
    expect((await boot({ languages: ['fr-FR'] })).module.language.value).toBe('en')
  })

  it('reads a value it does not know, and storage that throws, as "system"', async () => {
    const unknown = await boot({ stored: 'de', languages: ['ru'] })
    expect(unknown.module.preference.value).toBe('system')
    expect(unknown.module.language.value).toBe('ru')
    const blocked = await boot({ storageThrows: true, languages: ['en'] })
    expect(blocked.module.preference.value).toBe('system')
    expect(blocked.module.language.value).toBe('en')
  })
})

describe('setLanguagePreference', () => {
  it('stores the choice, updates <html lang> and both refs, and announces the change once', async () => {
    const { module, store, attributes } = await boot({ languages: ['en-US'] })
    const seen: string[] = []
    const off = module.onLanguageChange((lang) => seen.push(lang))

    module.setLanguagePreference('ru')
    expect(store.get('arxhub.language')).toBe('ru')
    expect(attributes.lang).toBe('ru')
    expect(module.language.value).toBe('ru')
    expect(module.preference.value).toBe('ru')

    module.setLanguagePreference('ru')
    expect(seen).toEqual(['ru'])

    module.setLanguagePreference('system')
    expect(store.has('arxhub.language')).toBe(false)
    expect(module.language.value).toBe('en')
    expect(module.preference.value).toBe('system')
    expect(seen).toEqual(['ru', 'en'])

    off()
    module.setLanguagePreference('ru')
    expect(seen).toEqual(['ru', 'en'])
  })

  it('still switches for the session when storage refuses the write', async () => {
    const { module } = await boot({ storageThrows: true })
    module.setLanguagePreference('ru')
    expect(module.language.value).toBe('ru')
  })

  it('useLanguage hands out the same refs and setter', async () => {
    const { module } = await boot({})
    const { useLanguage } = await import('../use-language')
    const view = useLanguage()
    expect(view.language).toBe(module.language)
    view.setPreference('ru')
    expect(module.language.value).toBe('ru')
    expect(view.languages).toEqual(['en', 'ru'])
  })
})
