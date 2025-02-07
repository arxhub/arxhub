import { RenderableError } from "~/core/error/api"

export interface ArxWikiErrorOptions {
  code: string
  httpStatusCode: number
  title?: string
  message: string
  resource?: string
  originalError?: unknown
  metadata?: Record<string, unknown>
}

export class ArxWikiError extends Error implements RenderableError {
  httpStatusCode: number
  originalError: unknown
  resource?: string
  code: string
  title?: string
  metadata?: Record<string, unknown>

  constructor(options: ArxWikiErrorOptions) {
    super(options.message)
    this.code = options.code
    this.httpStatusCode = options.httpStatusCode
    this.message = options.message
    this.originalError = options.originalError
    this.resource = options.resource
    this.title = options.title
    this.metadata = options.metadata
    Object.setPrototypeOf(this, ArxWikiError.prototype)
  }

  withMetadata(metadata: Record<string, unknown>) {
    this.metadata = metadata
    return this
  }

  render() {
    return {
      statusCode: this.httpStatusCode,
      code: this.code,
      title: this.title || 'Something went wrong ¯\\\_(ツ)_/¯',
      message: this.message,
    }
  }

  getOriginalError() {
    return this.originalError
  }
}

export function isArxWikiError(errorCode: string, err: unknown): err is ArxWikiError {
  return err instanceof ArxWikiError && err.code === errorCode
}
