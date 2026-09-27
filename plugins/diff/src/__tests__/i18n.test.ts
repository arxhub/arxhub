import { setLanguagePreference } from '@arxhub/i18n'
import { catalogProblems, manifestProblems } from '@arxhub/i18n/testing'
import { afterEach, expect, test } from 'vitest'
import { messages } from '../i18n/messages'
import { manifest } from '../manifest'
import { changesLabel, foldLabel, movedHereLabel } from '../ui/labels'

afterEach(() => setLanguagePreference('en'))

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})

test('the counters take the Russian plural forms', () => {
  setLanguagePreference('ru')
  expect([1, 2, 5, 11, 21].map(changesLabel)).toEqual(['1 правка', '2 правки', '5 правок', '11 правок', '21 правка'])
  expect(foldLabel(3, 'lines')).toBe('3 строки без изменений')
  expect(movedHereLabel({ direction: 'up', distance: 3 })).toBe('перемещён сюда · был на 3 блока ниже')
})

test('the manifest describes the plugin in Russian too', () => {
  expect(manifestProblems(manifest)).toEqual([])
})
