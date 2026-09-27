import { catalogProblems } from '@arxhub/i18n/testing'
import { expect, test } from 'vitest'
import { messages } from '../i18n/messages'

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})
