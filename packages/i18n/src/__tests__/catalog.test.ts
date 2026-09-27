import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { computed } from 'vue'
import { defineMessages, type MessageKey, messagesFor, type Translation } from '../catalog'
import { setLanguagePreference } from '../language'

const en = {
  title: 'Documents',
  greeting: 'Hello, {name}',
  files: { one: 'One file', other: '{count} files' },
  moved: { one: '{count} file moved to {folder}', other: '{count} files moved to {folder}' },
  nested: { deeper: { leaf: 'Leaf' } },
  onlyEn: 'Only in English',
  config: { 'sql.maxRows': { title: 'Row limit' } },
} as const

const ru: Translation<typeof en> = {
  title: 'Документы',
  greeting: 'Привет, {name}',
  files: { one: '{count} файл', few: '{count} файла', many: '{count} файлов' },
  moved: { one: '{count} файл перемещён в {folder}', few: '{count} файла перемещены в {folder}', many: '{count} файлов перемещены в {folder}' },
  nested: { deeper: { leaf: 'Лист' } },
  onlyEn: 'Только по-английски',
  config: { 'sql.maxRows': { title: 'Предел строк' } },
}

const messages = defineMessages('sample', en, ru)
const { t } = messages

afterEach(() => setLanguagePreference('en'))

describe('t', () => {
  it('reads a dotted leaf path in the current language', () => {
    setLanguagePreference('en')
    expect(t('title')).toBe('Documents')
    expect(t('nested.deeper.leaf')).toBe('Leaf')
    setLanguagePreference('ru')
    expect(t('title')).toBe('Документы')
    expect(t('nested.deeper.leaf')).toBe('Лист')
  })

  it('fills {name} placeholders', () => {
    setLanguagePreference('ru')
    expect(t('greeting', { name: 'Анна' })).toBe('Привет, Анна')
  })

  it('reaches a key that itself contains a dot', () => {
    setLanguagePreference('ru')
    expect(t('config.sql.maxRows.title')).toBe('Предел строк')
  })

  it('picks the English plural form', () => {
    setLanguagePreference('en')
    expect(t('files', { count: 1 })).toBe('One file')
    expect(t('files', { count: 0 })).toBe('0 files')
    expect(t('files', { count: 2 })).toBe('2 files')
    expect(t('files', { count: 1200 })).toBe('1,200 files')
  })

  it('picks the Russian one / few / many forms', () => {
    setLanguagePreference('ru')
    const cases: [number, string][] = [
      [1, '1 файл'],
      [21, '21 файл'],
      [101, '101 файл'],
      [2, '2 файла'],
      [4, '4 файла'],
      [22, '22 файла'],
      [5, '5 файлов'],
      [11, '11 файлов'],
      [12, '12 файлов'],
      [14, '14 файлов'],
      [25, '25 файлов'],
      [0, '0 файлов'],
      [111, '111 файлов'],
    ]
    for (const [count, text] of cases) expect(t('files', { count })).toBe(text)
  })

  it('a fraction without `other` falls back to `many`, and {count} is a formatted number', () => {
    setLanguagePreference('ru')
    expect(t('files', { count: 1.5 })).toBe('1,5 файлов')
    expect(t('moved', { count: 3, folder: 'Архив' })).toBe('3 файла перемещены в Архив')
  })

  it('falls back to English for a key Russian lacks, and to ns:key for one nobody has', () => {
    const partial = defineMessages('partial', { a: 'A', b: 'B' } as const, { a: 'А' } as Translation<{ a: 'A'; b: 'B' }>)
    setLanguagePreference('ru')
    expect(partial.t('a')).toBe('А')
    expect(partial.t('b')).toBe('B')
    expect((partial.t as unknown as (key: string) => string)('missing')).toBe('partial:missing')
    expect(partial.has('b')).toBe(true)
    expect(partial.has('missing')).toBe(false)
  })

  it('is reactive: a computed re-reads it after a switch', () => {
    setLanguagePreference('en')
    const label = computed(() => t('title'))
    expect(label.value).toBe('Documents')
    setLanguagePreference('ru')
    expect(label.value).toBe('Документы')
  })

  it('a second registration of a namespace replaces the first (a hot reload)', () => {
    defineMessages('hmr', { a: 'old' } as const, { a: 'старое' })
    const next = defineMessages('hmr', { a: 'new' } as const, { a: 'новое' })
    expect(messagesFor('hmr')).toBe(next)
  })

  it('types the keys and the parameters from the English literal', () => {
    expectTypeOf<MessageKey<typeof en>>().toEqualTypeOf<
      'title' | 'greeting' | 'files' | 'moved' | 'nested.deeper.leaf' | 'onlyEn' | 'config.sql.maxRows.title'
    >()
    // @ts-expect-error — `greeting` needs its {name}
    t('greeting')
    // @ts-expect-error — `title` takes no parameters
    t('title', { name: 'x' })
    // @ts-expect-error — a plural needs a count
    t('files')
    // @ts-expect-error — `moved` also needs its {folder}
    t('moved', { count: 1 })
    // @ts-expect-error — not a key
    t('nope')
  })
})

describe('raw', () => {
  it("keeps the placeholders of the reader's language, in its word order", () => {
    const messages = defineMessages('raw-sample', { help: '{sample} fixes the row' } as const, { help: 'строку закрепляет {sample}' })
    setLanguagePreference('ru')
    expect(messages.raw('help')).toBe('строку закрепляет {sample}')
    setLanguagePreference('en')
    expect(messages.raw('help')).toBe('{sample} fixes the row')
  })
})
