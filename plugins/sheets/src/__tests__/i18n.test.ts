import { describeError, setLanguagePreference } from '@arxhub/i18n'
import { catalogProblems, manifestProblems } from '@arxhub/i18n/testing'
import { afterEach, expect, test } from 'vitest'
import { errorText, sheetsError } from '../errors'
import { messages } from '../i18n/messages'
import { manifest } from '../manifest'

afterEach(() => setLanguagePreference('en'))

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})

test('an error keeps its English body and reads in the interface language', () => {
  const error = sheetsError('SheetInvalidCell', { cell: 'ZZ9' })
  expect(error.message).toBe('Invalid spreadsheet cell: ZZ9')
  expect(errorText(error)).toBe('Invalid spreadsheet cell: ZZ9')
  setLanguagePreference('ru')
  expect(error.message).toBe('Invalid spreadsheet cell: ZZ9')
  expect(errorText(error)).toBe('Неверная ячейка таблицы: ZZ9')
  // A worker posts the body, not the instance.
  expect(describeError(error.body)?.message).toBe('Неверная ячейка таблицы: ZZ9')
})

test('the manifest describes the plugin in Russian too', () => {
  expect(manifestProblems(manifest)).toEqual([])
})
