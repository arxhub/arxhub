import { AppError } from '@arxhub/stdlib/errors/app-error'

export class MountNotFound extends AppError {
  constructor(pathname: string) {
    super({
      code: MountNotFound.name,
      httpStatusCode: 404,
      title: 'Mount Not Found',
      message: `Mount not found: '${pathname}'`,
    })
  }
}
