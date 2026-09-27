import { isAppError } from '@arxhub/errors'
import { isPlural, lookup, registeredMessages, render } from './catalog'
import { type Language, language } from './language'

export interface ErrorDescription {
  title: string
  message: string
}

type ErrorBody = Record<string, unknown> & { code: string }

function bodyOf(error: unknown): ErrorBody | null {
  if (isAppError(error)) return error.body
  // A server's rendered error arrives as its JSON body, not as an AppError instance.
  if (error != null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') return error as ErrorBody
  return null
}

function paramsOf(body: ErrorBody): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(body)) if (typeof value === 'string' || typeof value === 'number') params[key] = value
  return params
}

// A message may be a plural entry keyed by the body's `count` ("1 conflict copy" / "3 копии").
function asDescription(entry: unknown, lang: Language, params: Record<string, string | number>): ErrorDescription | null {
  if (entry == null || typeof entry !== 'object') return null
  const { title, message } = entry as { title?: unknown; message?: unknown }
  if (typeof title !== 'string' || (typeof message !== 'string' && !isPlural(message))) return null
  const text = render(message, lang, params)
  return text === undefined ? null : { title: render(title, lang, params) ?? title, message: text }
}

// The body stays English — logs, HTTP and tests read it; what the person reads is looked up by `code` in the
// `errors` section of whichever catalog carries it (the plugin that shows the error, not the package that
// throws it, when that package has no UI).
export function describeError(error: unknown): ErrorDescription | null {
  const body = bodyOf(error)
  if (!body) return null
  const params = paramsOf(body)
  const path = `errors.${body.code}`
  const all = registeredMessages()
  const own = language.value === 'ru' ? all.map((m) => asDescription(lookup(m.ru, path), 'ru', params)).find((d) => d != null) : undefined
  const entry = own ?? all.map((m) => asDescription(lookup(m.en, path), 'en', params)).find((d) => d != null)
  if (entry) return entry
  return {
    title: typeof body.title === 'string' ? body.title : body.code,
    message: typeof body.message === 'string' ? body.message : '',
  }
}

// The one line a person reads about a failure: the catalog's text for a known code, else the message of
// what was thrown, else `fallback` — the showing plugin's own "the reason was not reported". Never
// `String(error)`, which prints the class name ("AppError: …") at the reader.
export function errorReason(error: unknown, fallback: string): string {
  const described = describeError(error)?.message
  if (described) return described
  if (error instanceof Error && error.message !== '') return error.message
  return fallback
}
