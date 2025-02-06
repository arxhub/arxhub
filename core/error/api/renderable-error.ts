import { GenericError } from './generic-error.ts'

export interface RenderableError {
  render(): GenericError

  getOriginalError(): unknown
}

export function isRenderableError(error: unknown): error is RenderableError {
  return error != null && typeof error === 'object' && 'render' in error
}
