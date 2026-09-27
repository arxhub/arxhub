import type { Messages } from '@arxhub/i18n'

// Where a generated form finds the words for a field: a path into the owning plugin's catalog —
// `config.<field key>.title|description|unit`, `config.<field key>.enum.<value>`, `.hint.<value>`, and
// `config.groups.<group id>`. The field key is literal (`sql.maxRows` is one segment), which the catalog
// lookup resolves. Unset, or a path with no entry: the schema's own annotation, then the key.
// `count` picks a plural's form — a unit next to a number ("24 слова", "5 слов") is one.
export type FieldTextResolver = (path: string, params?: { count: number }) => string | undefined

export function fieldTextFrom(messages: Messages | undefined): FieldTextResolver | undefined {
  if (messages == null) return undefined
  // The paths are built from schema keys at runtime, so they cannot be the typed keys `t` checks.
  const translate = messages.t as unknown as (key: string, params?: { count: number }) => string
  return (path, params) => (messages.has(path) ? translate(path, params) : undefined)
}
