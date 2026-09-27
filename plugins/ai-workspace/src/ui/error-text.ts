import { describeError } from '@arxhub/i18n'

export function errorText(error: unknown): string {
  const described = describeError(error)
  if (described && described.message !== '') return described.message
  return error instanceof Error ? error.message : String(error)
}
