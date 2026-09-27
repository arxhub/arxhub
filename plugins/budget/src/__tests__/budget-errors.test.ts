import { describeError, setLanguagePreference } from '@arxhub/i18n'
import { afterEach, expect, test } from 'vitest'
import { budgetError } from '../errors'
import '../i18n/messages'

afterEach(() => setLanguagePreference('en'))

test('the body stays English and carries its parameters', () => {
  const error = budgetError('BudgetItemName', { item: 3 })
  expect(error.message).toBe('Enter a name for item 3.')
  expect(error.body).toMatchObject({ code: 'BudgetItemName', statusCode: 400, item: 3 })
})

test('the person reads the refusal in their own language', () => {
  setLanguagePreference('ru')
  expect(describeError(budgetError('BudgetItemName', { item: 3 }))?.message).toBe('Введите название позиции 3.')
})
