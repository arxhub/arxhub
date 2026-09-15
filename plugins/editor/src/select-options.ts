import { type ArxDataVersion, type ArxFormatConfig, type ArxJsonNode, isRecord } from './document-migrations'

export interface SelectOption {
  id: string
  label: string
}

export function isSelectOptionList(value: unknown): value is SelectOption[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const option of value) {
    if (!isRecord(option) || typeof option.id !== 'string' || !option.id || typeof option.label !== 'string' || ids.has(option.id)) return false
    ids.add(option.id)
  }
  return true
}

// Eight hex characters of a UUID: opaque, and unique among the handful of options one dropdown holds —
// the caller passes the ids already taken, so the odds only have to be long, not astronomical.
export function newSelectOptionId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = crypto.randomUUID().slice(0, 8)
    if (!taken.has(id)) return id
  }
}

// An option written before ids existed is identified by its label — the one thing the file said about
// it — so a stored `value` keeps naming the same option with no lookup table. Repeats collapse (the
// configure form never wrote them, a hand edit might), and anything that is not a string is dropped.
export function legacySelectOptions(options: readonly unknown[]): SelectOption[] {
  const seen = new Set<string>()
  const result: SelectOption[] = []
  for (const option of options) {
    if (typeof option !== 'string' || !option || seen.has(option)) continue
    seen.add(option)
    result.push({ id: option, label: option })
  }
  return result
}

export function selectedLabel(options: readonly SelectOption[], value: unknown): string | null {
  return options.find((option) => option.id === value)?.label ?? null
}

function migrateSelect(node: ArxJsonNode): ArxJsonNode {
  const attrs = isRecord(node.attrs) ? node.attrs : {}
  if (isSelectOptionList(attrs.options)) return node
  const options = legacySelectOptions(Array.isArray(attrs.options) ? attrs.options : [])
  return { ...node, attrs: { ...attrs, options, value: options.some((option) => option.id === attrs.value) ? attrs.value : null } }
}

// The first versioned owner in the base schema. `select` is a base node, not a contribution, so it gets
// its version entry here rather than through `ArxEditorExtension.register`; the mechanism is the same
// one a plugin's data goes through (`document-migrations.ts`), recorded under `plugins` in the envelope.
export const SELECT_FORMAT_VERSION: ArxDataVersion = {
  id: 'arxhub.editor.select',
  version: 2,
  nodes: ['select'],
  marks: [],
  migrations: { 1: migrateSelect },
}

// What every kit's `format` starts from — and the config a module with no live kit to ask
// (`arx-merge.ts`) reads a file written before options had ids through.
export const BASE_FORMAT: ArxFormatConfig = { versions: [SELECT_FORMAT_VERSION] }
