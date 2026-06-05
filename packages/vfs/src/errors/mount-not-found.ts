import { AppError } from '@arxhub/errors'

export const mountNotFound = (pathname: string) =>
  new AppError({
    code: 'MountNotFound',
    statusCode: 404,
    title: 'Mount Not Found',
    message: `Mount not found: '${pathname}'`,
  })
