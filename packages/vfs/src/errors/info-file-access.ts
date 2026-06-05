import { AppError } from '@arxhub/errors'

export const infoFileAccess = (pathname: string) =>
  new AppError({
    code: 'InfoFileAccess',
    statusCode: 403,
    title: 'Info File Access Denied',
    message: `Direct access to sidecar file '${pathname}' is not allowed`,
  })
