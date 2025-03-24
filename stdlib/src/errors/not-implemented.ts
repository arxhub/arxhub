import { AppError } from './app-error'

export class NotImplemented extends AppError {
  constructor(message?: string) {
    super({
      code: NotImplemented.name,
      httpStatusCode: 500,
      title: 'Not implemented',
      message: message || 'Method not implemented',
    })
  }
}
