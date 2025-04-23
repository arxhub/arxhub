import { AppError } from '@arxhub/stdlib/errors/app-error'

export class FileNotFound extends AppError {
  constructor(pathname: string) {
    super({
      httpStatusCode: 404,
      title: 'File Not Found',
      message: `File not found: '${pathname}'`,
    })
  }
}
