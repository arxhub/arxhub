import { AppError } from '@arxhub/errors'

export const fileNotFound = (pathname: string) =>
  new AppError({
    code: 'FileNotFound',
    statusCode: 404,
    title: 'File Not Found',
    message: `File not found: '${pathname}'`,
  })
