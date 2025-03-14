import { AppError } from '@arxhub/stdlib/errors'
import type { VirtualFile } from './file'

export class FileNotFound extends AppError {
  constructor(message: string | VirtualFile) {
    super({
      code: FileNotFound.name,
      httpStatusCode: 404,
      title: 'File Not Found',
      message: typeof message === 'string' ? message : message.stat(),
    })
  }
}
