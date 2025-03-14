import { AppError } from './error'

export class IllegalStateError extends AppError {
  constructor(message: string) {
    super({
      code: IllegalStateError.name,
      httpStatusCode: 500,
      title: 'Illegal State',
      message: message,
    })
  }
}
