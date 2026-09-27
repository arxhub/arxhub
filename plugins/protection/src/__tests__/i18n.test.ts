import { setLanguagePreference } from '@arxhub/i18n'
import { catalogProblems, manifestProblems } from '@arxhub/i18n/testing'
import { afterEach, expect, test } from 'vitest'
import { describeRejection } from '../auth-status'
import { serverStatusLine } from '../entry/server-status-line'
import { messages } from '../i18n/messages'
import { manifest, serverManifest } from '../manifest'

afterEach(() => setLanguagePreference('system'))

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})

// The count reaches Russian through its plural forms, and the size through the reader's units.
test('a found vault is counted in Russian', () => {
  setLanguagePreference('ru')
  const found = (documents: number) =>
    serverStatusLine({ kind: 'found', summary: { empty: false, documents, bytes: 3435973837 } }, 'join')?.text
  expect(found(1)).toBe('Хранилище найдено · 1 документ · 3,2 ГБ')
  expect(found(3)).toBe('Хранилище найдено · 3 документа · 3,2 ГБ')
  expect(found(1248)).toBe('Хранилище найдено · 1\u00a0248 документов · 3,2 ГБ')
})

test('a refusal is explained in the language on screen at the time it is read', () => {
  const english = describeRejection('stale').label
  setLanguagePreference('ru')
  expect(describeRejection('stale').label).toBe('Часы расходятся')
  setLanguagePreference('en')
  expect(describeRejection('stale').label).toBe(english)
})

test('the manifest describes the plugin in Russian too', () => {
  expect(manifestProblems(manifest, serverManifest)).toEqual([])
})
