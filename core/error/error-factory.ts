import { ArxWikiError } from './arxwiki-error.ts'
import { ErrorCode } from './error-code.ts'

export const ErrorFactory = {
  NotImplemented: (resource?: string) =>
    new ArxWikiError({
      code: ErrorCode.NotImplemented,
      httpStatusCode: 500,
      resource: resource,
      message: 'Not implemented',
    }),

  InternalError: (message?: string, err?: unknown) =>
    new ArxWikiError({
      code: ErrorCode.InternalError,
      httpStatusCode: 500,
      message: message || 'Internal server error',
      originalError: err,
    }),

  NotFound: (message?: string, err?: unknown) =>
    new ArxWikiError({
      code: ErrorCode.NotFound,
      httpStatusCode: 404,
      message: message || 'Not found',
      originalError: err,
    }),

  FileRendererNotFound: (file: VirtualFile) =>
    new ArxWikiError({
      code: ErrorCode.FileRendererNotFound,
      httpStatusCode: 500,
      resource: file.pathname,
      title: 'File renderer not found',
      message: `Unknown file type: '${file.type}'`,
      metadata: {
        pathname: file.pathname,
        path: file.path,
        name: file.name,
        extension: file.extension,
        type: file.type,
        kind: file.kind,
      },
    }),

  KeyError: (message: string) =>
    new ArxWikiError({
      code: ErrorCode.KeyError,
      httpStatusCode: 500,
      title: 'Key Error',
      message: message,
    }),

  NotAllowed: (message: string) =>
    new ArxWikiError({
      code: ErrorCode.NotAllowed,
      httpStatusCode: 403,
      title: 'Not Allowed',
      message: message,
    }),
}
