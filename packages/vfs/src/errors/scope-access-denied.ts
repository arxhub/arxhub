import { AppError } from '@arxhub/errors'

export const scopeAccessDenied = (pathname: string) =>
  new AppError({
    code: 'ScopeAccessDenied',
    statusCode: 403,
    title: 'Scope Access Denied',
    message: `Access to '${pathname}' is outside the granted scope`,
  })
