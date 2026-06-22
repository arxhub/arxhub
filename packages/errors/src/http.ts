import { type Static, Type } from '@sinclair/typebox'
import { AppError, defineAppError } from './core'

export const validationErrorSchema = defineAppError('ValidationError', 400)
export const unauthorizedErrorSchema = defineAppError('UnauthorizedError', 401)
export const forbiddenErrorSchema = defineAppError('ForbiddenError', 403)
export const notFoundErrorSchema = defineAppError('NotFoundError', 404)
export const internalServerErrorSchema = defineAppError('InternalServerError', 500)
export const illegalStateErrorSchema = defineAppError('IllegalStateError', 500)
export const keyErrorSchema = defineAppError('KeyError', 500)
export const notImplementedErrorSchema = defineAppError('NotImplementedError', 500)
export const aggregateErrorSchema = defineAppError('AggregateError', 500)

// Union of the generic application errors. Per-domain packages define their own
// schemas via defineAppError; compose unions at a boundary when validation is needed.
export const appErrorSchema = Type.Union([
  validationErrorSchema,
  unauthorizedErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  internalServerErrorSchema,
  illegalStateErrorSchema,
  keyErrorSchema,
  notImplementedErrorSchema,
  aggregateErrorSchema,
])

export type AppErrorBody = Static<typeof appErrorSchema>
export type AppErrorCode = AppErrorBody['code']

export const validation = (message = 'Validation failed', title = 'Validation failed') =>
  new AppError<Static<typeof validationErrorSchema>>({ code: 'ValidationError', statusCode: 400, title, message })

export const unauthorized = (message = 'Unauthorized', title = 'Unauthorized') =>
  new AppError<Static<typeof unauthorizedErrorSchema>>({ code: 'UnauthorizedError', statusCode: 401, title, message })

export const forbidden = (message = 'Forbidden', title = 'Forbidden') =>
  new AppError<Static<typeof forbiddenErrorSchema>>({ code: 'ForbiddenError', statusCode: 403, title, message })

export const notFound = (message = 'Not Found', title = 'Not Found') =>
  new AppError<Static<typeof notFoundErrorSchema>>({ code: 'NotFoundError', statusCode: 404, title, message })

export const internalServer = (originalError?: unknown, message = 'Something went wrong', title = 'Internal Server Error') =>
  new AppError<Static<typeof internalServerErrorSchema>>({ code: 'InternalServerError', statusCode: 500, title, message }, originalError)

export const illegalState = (message: string, title = 'Illegal State') =>
  new AppError<Static<typeof illegalStateErrorSchema>>({ code: 'IllegalStateError', statusCode: 500, title, message })

export const keyError = (message: string, title = 'Key Error') =>
  new AppError<Static<typeof keyErrorSchema>>({ code: 'KeyError', statusCode: 500, title, message })

export const notImplemented = (message = 'Method not implemented', title = 'Not implemented') =>
  new AppError<Static<typeof notImplementedErrorSchema>>({ code: 'NotImplementedError', statusCode: 500, title, message })

// Wraps several failed operations into one error; the individual causes are kept on `originalError`
// (an array), mirroring the native AggregateError's `errors` without the bare `new`.
export const aggregate = (errors: unknown[], message = `${errors.length} error(s) occurred`, title = 'Aggregate Error') =>
  new AppError<Static<typeof aggregateErrorSchema>>({ code: 'AggregateError', statusCode: 500, title, message }, errors)
