import { catalogProblems, manifestProblems } from '@arxhub/i18n/testing'
import { expect, test } from 'vitest'
import { messages } from '../i18n/messages'
import { manifest } from '../manifest'

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})

test('the manifest describes the plugin in Russian too', () => {
  expect(manifestProblems(manifest)).toEqual([])
})
