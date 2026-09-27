import { AppError, type GenericAppError } from '@arxhub/errors'
import type { ParamsOf } from '@arxhub/i18n'
import { en } from './i18n/en'

type Entries = (typeof en)['errors']
export type AiWorkspaceErrorCode = keyof Entries

// The body stays English (logs, tests); the page reads the catalog through describeError by `code`. Only
// the plain catalog data is imported, never the reactive i18n runtime: the session store also runs in the
// headless server's routes, which bundle no Vue.
export function aiWorkspaceError<C extends AiWorkspaceErrorCode>(
  code: C,
  statusCode: number,
  ...params: ParamsOf<Entries[C]['message']>
): AppError {
  const values = (params[0] ?? {}) as Record<string, string | number>
  const entry = en.errors[code]
  const message = entry.message.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole))
  const body: GenericAppError = { ...values, code, statusCode, title: entry.title, message }
  return new AppError(body)
}
