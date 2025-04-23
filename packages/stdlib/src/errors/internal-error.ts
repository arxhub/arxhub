import { AppError } from './app-error'

export class InternalError extends AppError {
  constructor(message?: string) {
    super({
      httpStatusCode: 500,
      message: message || 'Internal Error',
    })
  }
}
