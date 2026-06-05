import { type Static, Type } from '@sinclair/typebox'

// Base shape every application error renders to. `code` discriminates the error.
export const genericAppErrorSchema = Type.Object({
  code: Type.String(),
  statusCode: Type.Number(),
  title: Type.String(),
  message: Type.String(),
})

export type GenericAppError = Static<typeof genericAppErrorSchema>

// Builds a schema for a concrete error: literal `code` + `statusCode` over the base shape.
// Compose with Type.Composite([...]) when an error needs extra structured fields.
export function defineAppError<const C extends string, const S extends number>(code: C, statusCode: S) {
  return Type.Object({
    code: Type.Literal(code),
    statusCode: Type.Literal(statusCode),
    title: Type.String(),
    message: Type.String(),
  })
}

export interface RenderableError {
  render(): GenericAppError
}

export const isRenderableError = (e: unknown): e is RenderableError =>
  e != null && typeof e === 'object' && 'render' in e

// A single error class carrying its rendered body as data — no per-error subclasses.
// Create instances through the factory functions (see ./http), not `new` directly.
export class AppError<B extends GenericAppError = GenericAppError> extends Error implements RenderableError {
  readonly body: B
  readonly originalError?: unknown

  constructor(body: B, originalError?: unknown) {
    super(body.message)
    this.name = 'AppError'
    this.body = body
    this.originalError = originalError
  }

  render(): B {
    return this.body
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError

export const hasErrorCode = (e: unknown, code: string): e is AppError =>
  e instanceof AppError && e.body.code === code
