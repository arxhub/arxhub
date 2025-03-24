import { AppError } from '~/stdlib/error.ts'
import type { VirtualFile } from '~/plugins/vfs/file.ts'

export class FileLoaderNotFound extends AppError {
  constructor(file: VirtualFile) {
    super({
      code: FileLoaderNotFound.name,
      httpStatusCode: 500,
      title: 'File Loader Not Found',
      message: file.stat(),
    })
  }
}
