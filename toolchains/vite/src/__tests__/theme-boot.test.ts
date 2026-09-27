import { describe, expect, it } from 'vitest'
import { themeBoot } from '../theme-boot'

type Hook = (...args: unknown[]) => unknown

function hook(plugin: ReturnType<typeof themeBoot>, name: string): Hook {
  const value = (plugin as unknown as Record<string, Hook | { handler: Hook } | undefined>)[name]
  if (value == null) throw new Error(`themeBoot has no ${name} hook`)
  return typeof value === 'function' ? value : value.handler
}

// The script is read the way the browser gets it: as the asset the build emits, not through an export.
function emittedSource(): string {
  const plugin = themeBoot()
  hook(plugin, 'configResolved')({ base: '/' })
  let source: string | null = null
  hook(plugin, 'generateBundle').call({
    emitFile: (file: { fileName: string; source: string }) => {
      expect(file.fileName).toBe('arxhub-theme-boot.js')
      source = file.source
    },
  })
  if (source == null) throw new Error('themeBoot emitted nothing')
  return source
}

interface World {
  stored?: string | null
  storedLanguage?: string | null
  languages?: string[]
  storageThrows?: boolean
  systemDark?: boolean
  matchMediaThrows?: boolean
  attributes?: Record<string, string>
}

// The theme cases read the theme's attributes only; the language block has its own cases below.
function run(world: World): Record<string, string> {
  const { lang: _lang, ...theme } = runWithHead(world).attributes
  return theme
}

function lang(world: World): string | undefined {
  return runWithHead(world).attributes.lang
}

function runWithHead(world: World): { attributes: Record<string, string>; head: Record<string, string>[] } {
  const attributes: Record<string, string> = { ...world.attributes }
  const head: Record<string, string>[] = []
  const document = {
    documentElement: {
      hasAttribute: (name: string) => name in attributes,
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => {
        attributes[name] = value
      },
    },
    createElement: (tag: string) => {
      const element: Record<string, string> = { tag }
      return { element, setAttribute: (name: string, value: string) => (element[name] = value) }
    },
    head: { appendChild: (node: { element: Record<string, string> }) => head.push(node.element) },
  }
  const localStorage = {
    getItem: (key: string) => {
      if (world.storageThrows) throw new Error('SecurityError')
      if (key === 'arxhub.language') return world.storedLanguage ?? null
      return key === 'arxhub.theme' ? (world.stored ?? null) : null
    },
  }
  const matchMedia = (query: string) => {
    if (world.matchMediaThrows) throw new Error('no matchMedia')
    expect(query).toBe('(prefers-color-scheme: dark)')
    return { matches: world.systemDark === true }
  }
  const navigator = { languages: world.languages ?? ['en-US'], language: world.languages?.[0] ?? '' }
  new Function('document', 'localStorage', 'matchMedia', 'navigator', emittedSource())(document, localStorage, matchMedia, navigator)
  return { attributes, head }
}

describe('theme boot script', () => {
  it('puts the saved theme on the document, over the system scheme', () => {
    const attributes = run({ stored: JSON.stringify({ id: 'slate', base: 'dark' }), systemDark: false })
    expect(attributes).toEqual({ 'data-theme': 'dark', 'data-arxhub-theme': 'slate' })
  })

  it('a saved light theme wins over a dark system', () => {
    const attributes = run({ stored: JSON.stringify({ id: 'catppuccin-latte', base: 'light' }), systemDark: true })
    expect(attributes).toEqual({ 'data-theme': 'light', 'data-arxhub-theme': 'catppuccin-latte' })
  })

  it('follows the system scheme when nothing is saved', () => {
    expect(run({ systemDark: true })).toEqual({ 'data-theme': 'dark' })
    expect(run({ systemDark: false })).toEqual({ 'data-theme': 'light' })
  })

  it('ignores a saved value that is not JSON', () => {
    expect(run({ stored: '{not json', systemDark: true })).toEqual({ 'data-theme': 'dark' })
  })

  it('ignores a saved base it does not know, but keeps the saved id', () => {
    expect(run({ stored: JSON.stringify({ id: 'slate', base: 'sepia' }), systemDark: false })).toEqual({
      'data-theme': 'light',
      'data-arxhub-theme': 'slate',
    })
  })

  it('survives storage that throws and a missing matchMedia', () => {
    expect(run({ storageThrows: true, systemDark: true })).toEqual({ 'data-theme': 'dark' })
    expect(run({ matchMediaThrows: true })).toEqual({ 'data-theme': 'light' })
  })

  it('does not overwrite attributes the document already carries', () => {
    const attributes = run({
      stored: JSON.stringify({ id: 'slate', base: 'dark' }),
      attributes: { 'data-theme': 'light', 'data-arxhub-theme': 'default' },
    })
    expect(attributes).toEqual({ 'data-theme': 'light', 'data-arxhub-theme': 'default' })
  })
})

describe('theme boot color-scheme', () => {
  it('declares the resolved base as the canvas colour scheme, before any stylesheet', () => {
    expect(runWithHead({ stored: JSON.stringify({ id: 'catppuccin-mocha', base: 'dark' }) }).head).toEqual([
      { tag: 'meta', name: 'color-scheme', content: 'dark' },
    ])
    expect(runWithHead({ systemDark: false }).head).toEqual([{ tag: 'meta', name: 'color-scheme', content: 'light' }])
  })

  it('follows a base the document already carries rather than the one it would have chosen', () => {
    expect(runWithHead({ systemDark: true, attributes: { 'data-theme': 'light' } }).head).toEqual([
      { tag: 'meta', name: 'color-scheme', content: 'light' },
    ])
  })
})

// The same cases as pickLanguage in packages/i18n: the script copies that rule, so it is held to its answers.
describe('language boot', () => {
  it('a stored choice wins over the system', () => {
    expect(lang({ storedLanguage: 'en', languages: ['ru-RU'] })).toBe('en')
    expect(lang({ storedLanguage: 'ru', languages: ['en-US'] })).toBe('ru')
  })

  it('without one, a Russian tag anywhere in the system list gives Russian, else English', () => {
    expect(lang({ languages: ['ru-RU', 'en-US'] })).toBe('ru')
    expect(lang({ languages: ['RU'] })).toBe('ru')
    expect(lang({ languages: ['de-DE', 'ru'] })).toBe('ru')
    expect(lang({ languages: ['en-GB'] })).toBe('en')
    expect(lang({ languages: ['uk-UA'] })).toBe('en')
    expect(lang({ languages: [] })).toBe('en')
  })

  it('ignores a stored value it does not know, and storage that throws', () => {
    expect(lang({ storedLanguage: 'de', languages: ['ru'] })).toBe('ru')
    expect(lang({ storageThrows: true, languages: ['ru-RU'] })).toBe('ru')
  })

  it('overrides the lang="en" fallback index.html carries', () => {
    expect(lang({ storedLanguage: 'ru', attributes: { lang: 'en' } })).toBe('ru')
  })
})

describe('themeBoot()', () => {
  it('prepends the script to <head> under the configured base', () => {
    const plugin = themeBoot()
    hook(plugin, 'configResolved')({ base: '/app/' })
    expect(hook(plugin, 'transformIndexHtml')('<html></html>')).toEqual([
      { tag: 'script', attrs: { src: '/app/arxhub-theme-boot.js' }, injectTo: 'head-prepend' },
    ])
  })

  it('serves the same source from the dev server under the base, and passes other URLs on', () => {
    const plugin = themeBoot()
    hook(plugin, 'configResolved')({ base: '/app/' })
    let middleware: ((req: { url?: string }, res: unknown, next: () => void) => void) | null = null
    hook(plugin, 'configureServer')({ middlewares: { use: (fn: typeof middleware) => (middleware = fn) } })
    if (middleware == null) throw new Error('no middleware')
    const serve = middleware as (req: { url?: string }, res: unknown, next: () => void) => void

    const headers: Record<string, string> = {}
    let body: string | null = null
    let passed = false
    serve(
      { url: '/app/arxhub-theme-boot.js?v=1' },
      { setHeader: (k: string, v: string) => (headers[k] = v), end: (b: string) => (body = b) },
      () => {
        passed = true
      },
    )
    expect(passed).toBe(false)
    expect(headers['Content-Type']).toMatch(/^text\/javascript/)
    expect(body).toBe(emittedSource())

    serve({ url: '/app/index.html' }, {}, () => {
      passed = true
    })
    expect(passed).toBe(true)
  })
})
