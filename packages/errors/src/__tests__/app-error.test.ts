import { describe, expect, it } from 'vitest'
import { AppError, hasErrorCode, isAppError, isRenderableError } from '../core'

describe('AppError', () => {
  const body = {
    code: 'ValidationError' as const,
    statusCode: 400 as const,
    title: 'Bad input',
    message: 'field x is required',
  }

  it('extends Error with name AppError and carries body', () => {
    const err = new AppError(body)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
    expect(err.name).toBe('AppError')
    expect(err.message).toBe(body.message)
    expect(err.body).toEqual(body)
  })

  it('render() returns the same body', () => {
    const err = new AppError(body)
    expect(err.render()).toEqual(body)
    expect(isRenderableError(err)).toBe(true)
  })

  it('optional originalError is preserved', () => {
    const cause = new Error('root')
    const err = new AppError(body, cause)
    expect(err.originalError).toBe(cause)
  })

  it('isAppError and hasErrorCode discriminate instances', () => {
    const err = new AppError(body)
    expect(isAppError(err)).toBe(true)
    expect(isAppError(new Error('nope'))).toBe(false)
    expect(hasErrorCode(err, 'ValidationError')).toBe(true)
    expect(hasErrorCode(err, 'NotFoundError')).toBe(false)
  })
})
