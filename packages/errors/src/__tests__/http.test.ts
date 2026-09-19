import { describe, expect, it } from 'vitest'
import { isAppError } from '../core'
import { aggregate, bootFailed, forbidden, internalServer, notFound, unauthorized, validation } from '../http'

describe('http error factories', () => {
  it('validation — 400 ValidationError', () => {
    const err = validation('bad field')
    expect(isAppError(err)).toBe(true)
    expect(err.name).toBe('AppError')
    expect(err.body).toMatchObject({ code: 'ValidationError', statusCode: 400, message: 'bad field' })
  })

  it('unauthorized — 401 UnauthorizedError', () => {
    const err = unauthorized()
    expect(err.body.code).toBe('UnauthorizedError')
    expect(err.body.statusCode).toBe(401)
  })

  it('forbidden — 403 ForbiddenError', () => {
    const err = forbidden()
    expect(err.body.code).toBe('ForbiddenError')
    expect(err.body.statusCode).toBe(403)
  })

  it('notFound — 404 NotFoundError', () => {
    const err = notFound('missing vault')
    expect(err.body).toMatchObject({ code: 'NotFoundError', statusCode: 404, message: 'missing vault' })
  })

  it('internalServer — 500 with originalError', () => {
    const cause = new Error('db down')
    const err = internalServer(cause, 'oops')
    expect(err.body.code).toBe('InternalServerError')
    expect(err.body.statusCode).toBe(500)
    expect(err.originalError).toBe(cause)
  })

  it('aggregate and bootFailed stash causes on originalError', () => {
    const a = new Error('a')
    const b = new Error('b')
    const agg = aggregate([a, b])
    expect(agg.body.code).toBe('AggregateError')
    expect(agg.body.statusCode).toBe(500)
    expect(agg.originalError).toEqual([a, b])

    const boot = bootFailed([a])
    expect(boot.body.code).toBe('BootFailedError')
    expect(boot.originalError).toEqual([a])
  })
})
