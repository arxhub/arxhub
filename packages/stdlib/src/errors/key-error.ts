import { AppError } from './app-error'

export class KeyError extends AppError {
  constructor(message: string) {
    super({
      httpStatusCode: 500,
      title: 'Key Error',
      message: message,
    })
  }
}
