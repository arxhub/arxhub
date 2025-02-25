import { AppError } from '~/stdlib/error.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'

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
