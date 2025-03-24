import { AppError } from './app-error'

export class InternalError extends AppError {
  constructor(message?: string) {
    super({
      code: InternalError.name,
      httpStatusCode: 500,
      message: message || 'Internal Error',
    })
  }
}
