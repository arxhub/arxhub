import { AppError } from '@arxhub/errors'
import { afterEach, describe, expect, it } from 'vitest'
import { defineMessages } from '../catalog'
import { describeError } from '../errors'
import { setLanguagePreference } from '../language'

defineMessages(
  'errors-sample',
  { errors: { 'file-too-large': { title: 'File too large', message: '{path} is over {limit} bytes' } } } as const,
  { errors: { 'file-too-large': { title: 'Файл слишком большой', message: '{path} больше {limit} байт' } } },
)

const tooLarge = new AppError({
  code: 'file-too-large',
  statusCode: 413,
  title: 'Payload Too Large',
  message: 'too big',
  path: 'a.pdf',
  limit: 10,
})

afterEach(() => setLanguagePreference('en'))

defineMessages(
  'errors-plural',
  { errors: { 'copies-left': { title: 'Copies left', message: { one: '{count} copy: {names}', other: '{count} copies: {names}' } } } } as const,
  {
    errors: {
      'copies-left': {
        title: 'Остались копии',
        message: { one: '{count} копия: {names}', few: '{count} копии: {names}', many: '{count} копий: {names}' },
      },
    },
  },
)

describe('describeError', () => {
  it("picks the plural form of a message by the body's count", () => {
    const error = (count: number) => new AppError({ code: 'copies-left', statusCode: 500, title: 'x', message: 'x', count, names: 'a, b' })
    setLanguagePreference('ru')
    expect(describeError(error(3))?.message).toBe('3 копии: a, b')
    expect(describeError(error(5))?.message).toBe('5 копий: a, b')
    setLanguagePreference('en')
    expect(describeError(error(1))?.message).toBe('1 copy: a, b')
  })

  it("translates by code, with the body's fields as parameters", () => {
    setLanguagePreference('ru')
    expect(describeError(tooLarge)).toEqual({ title: 'Файл слишком большой', message: 'a.pdf больше 10 байт' })
    setLanguagePreference('en')
    expect(describeError(tooLarge)).toEqual({ title: 'File too large', message: 'a.pdf is over 10 bytes' })
  })

  it('reads a server body that arrived as JSON the same way', () => {
    setLanguagePreference('ru')
    expect(describeError({ code: 'file-too-large', path: 'b.pdf', limit: 1 })?.title).toBe('Файл слишком большой')
  })

  it('falls back to the English body for a code nobody translates', () => {
    setLanguagePreference('ru')
    const error = new AppError({ code: 'nobody-knows', statusCode: 500, title: 'Broken', message: 'It broke' })
    expect(describeError(error)).toEqual({ title: 'Broken', message: 'It broke' })
  })

  it('is null for anything that is not an application error', () => {
    expect(describeError(new Error('x'))).toBeNull()
    expect(describeError('x')).toBeNull()
    expect(describeError(null)).toBeNull()
    expect(describeError({ status: 500 })).toBeNull()
  })
})
