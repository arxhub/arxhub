import { AppError } from './error'

export class KeyError extends AppError {
  constructor(message: string) {
    super({
      code: KeyError.name,
      httpStatusCode: 500,
      title: 'Key Error',
      message: message,
    })
  }
}
