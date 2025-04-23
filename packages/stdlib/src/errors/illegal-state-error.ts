import { AppError } from './app-error'

export class IllegalStateError extends AppError {
  constructor(message: string) {
    super({
      httpStatusCode: 500,
      title: 'Illegal State',
      message: message,
    })
  }
}
