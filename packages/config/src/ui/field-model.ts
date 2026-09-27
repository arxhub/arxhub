import type { TObject } from '@sinclair/typebox'
import { isDeviceLocal } from '../device-local'
import { t } from '../i18n/messages'
import type { FieldTextResolver } from './field-text'

// Which control a field renders as. The schema decides — a plugin never names a widget, so two
// plugins that describe the same shape get the same control.
export type ControlKind =
  | 'switch'
  | 'segmented'
  | 'radio-list'
  | 'slider'
  | 'stepper'
  | 'text'
  | 'textarea'
  | 'secret'
  | 'chips'
  | 'checkbox-list'
  | 'readonly'

export interface Choice {
  value: string
  label: string
  // Only the radio list has room for one; the segmented control ignores it.
  hint?: string
}

export interface FieldModel {
  key: string
  label: string
  description?: string
  group?: string
  kind: ControlKind
  required: boolean
  // Rendered under the control in mono — the schema line the design shows ("server.url · string · uri").
  signature: string
  deviceLocal?: boolean
  choices: Choice[]
  min?: number
  max?: number
  step?: number
  unit?: string
  // The unit as it reads after this number. A catalog may give a unit plural forms (Russian: 1 слово, 2 слова,
  // 5 слов); `unit` alone is the form after "many", which is what a range such as "до 100 слов" needs.
  unitFor?: (count: number) => string | undefined
  maxLength?: number
  pattern?: string
  // A field whose controlling boolean is off: shown, explained, and inert.
  disabled: boolean
  disabledBy?: string
}

// A control laid out beside its label rather than under it. Compact controls read as a value at the
// end of the row; anything that wants the full measure gets its own line.
const INLINE_KINDS: ReadonlySet<ControlKind> = new Set<ControlKind>(['switch', 'slider', 'stepper', 'readonly'])

export function isInline(kind: ControlKind): boolean {
  return INLINE_KINDS.has(kind)
}

// The subset of JSON Schema these controls read. Deliberately not `extends TSchema`: a TypeBox
// schema satisfies it structurally, and so does a hand-written schema object that never went
// through TypeBox.
export interface FieldSchema {
  type?: string
  title?: string
  description?: string
  enum?: unknown[]
  anyOf?: FieldSchema[]
  const?: unknown
  items?: FieldSchema
  minimum?: number
  maximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  readOnly?: boolean
  writeOnly?: boolean
  uniqueItems?: boolean
  // ArxHub extensions — plain JSON Schema annotations, ignored by validation.
  group?: string
  unit?: string
  multiline?: boolean
  enumLabels?: Record<string, string>
  enumHints?: Record<string, string>
  // Names a sibling boolean field; this one is inert while that one is false.
  enabledBy?: string
  // Kept on this device instead of in the synced config file (see device-local.ts).
  deviceLocal?: boolean
}

// A union of literals is how TypeBox spells an enum, so both shapes have to resolve to one list.
function ownChoices(schema: FieldSchema, text: ChoiceText): Choice[] {
  const raw: unknown[] = schema.enum ?? schema.anyOf?.map((member) => member.const).filter((value) => value !== undefined) ?? []
  return raw.map((value) => {
    const key = String(value)
    return { value: key, label: text.label(key) ?? schema.enumLabels?.[key] ?? key, hint: text.hint(key) ?? schema.enumHints?.[key] }
  })
}

export interface ChoiceText {
  label(value: string): string | undefined
  hint(value: string): string | undefined
}

const NO_CHOICE_TEXT: ChoiceText = { label: () => undefined, hint: () => undefined }

function choiceText(key: string, text: FieldTextResolver | undefined): ChoiceText {
  if (text == null) return NO_CHOICE_TEXT
  return { label: (value) => text(`config.${key}.enum.${value}`), hint: (value) => text(`config.${key}.hint.${value}`) }
}

// For an array the options live on the item schema, but the labels a plugin writes belong on the
// field it declared — so either level may carry them.
export function choicesFor(schema: FieldSchema, text: ChoiceText = NO_CHOICE_TEXT): Choice[] {
  if (schema.type !== 'array') return ownChoices(schema, text)
  const items = schema.items
  if (!items) return []
  return ownChoices({ ...items, enumLabels: schema.enumLabels ?? items.enumLabels, enumHints: schema.enumHints ?? items.enumHints }, text)
}

// Three or fewer options fit on one row as a segmented control; more than that needs a list, where
// each option also has room for the sentence explaining it.
const SEGMENTED_MAX_CHOICES = 3

// A range small enough to aim at with a thumb. Wider than this and dragging can't hit an exact
// value, so the number itself has to be typeable.
const SLIDER_MAX_RANGE = 100

// Past this a value is prose, not a token, and a single-line input hides most of it.
const TEXTAREA_MIN_MAX_LENGTH = 160

export function controlFor(schema: FieldSchema): ControlKind {
  if (schema.readOnly) return 'readonly'

  const choices = choicesFor(schema)
  // Arrays first: an array of enums is a set of checkboxes, never a segmented control.
  if (schema.type === 'array') return choices.length > 0 ? 'checkbox-list' : 'chips'
  if (choices.length > 0) return choices.length <= SEGMENTED_MAX_CHOICES ? 'segmented' : 'radio-list'
  if (schema.type === 'boolean') return 'switch'
  if (schema.type === 'number' || schema.type === 'integer') {
    const { minimum, maximum } = schema
    const aimable = minimum !== undefined && maximum !== undefined && maximum - minimum <= SLIDER_MAX_RANGE
    return aimable ? 'slider' : 'stepper'
  }
  if (schema.writeOnly) return 'secret'
  if (schema.multiline || (schema.maxLength !== undefined && schema.maxLength >= TEXTAREA_MIN_MAX_LENGTH)) return 'textarea'
  return 'text'
}

// The mono line under a control: the path, the type, and whichever constraint actually narrows the
// value. It is what makes a generated form auditable — you can see what the schema asked for.
export function signatureFor(key: string, schema: FieldSchema, choices: Choice[]): string {
  const parts: string[] = [key]

  if (choices.length > 0) parts.push(schema.type === 'array' ? `array<enum> · ${choices.length} values` : `enum · ${choices.length} values`)
  else if (schema.type === 'array') parts.push(`array<${schema.items?.type ?? 'string'}>`)
  else parts.push(schema.type ?? 'string')

  if (schema.format) parts.push(`format: ${schema.format}`)
  if (schema.pattern) parts.push(`pattern: ${schema.pattern}`)
  if (schema.minimum !== undefined && schema.maximum !== undefined) parts.push(`${schema.minimum}–${schema.maximum}`)
  else if (schema.minimum !== undefined) parts.push(`min: ${schema.minimum}`)
  else if (schema.maximum !== undefined) parts.push(`max: ${schema.maximum}`)
  if (schema.maxLength !== undefined) parts.push(`maxLength: ${schema.maxLength}`)
  if (schema.unit) parts.push(`unit: ${schema.unit}`)
  if (schema.writeOnly) parts.push('writeOnly')
  if (schema.readOnly) parts.push('readOnly')
  // Where the value is kept belongs in the signature for the same reason its type does: without it a
  // reader has every reason to assume the setting they just changed changed on all their devices.
  if (isDeviceLocal(schema)) parts.push('device-local', t('field.deviceOnly'))

  return parts.join(' · ')
}

export function buildFields(schema: TObject, values: Record<string, unknown>, text?: FieldTextResolver): FieldModel[] {
  const required = new Set(schema.required ?? [])
  const properties = (schema.properties ?? {}) as Record<string, FieldSchema>

  return Object.entries(properties).map(([key, field]) => {
    const choices = choicesFor(field, choiceText(key, text))
    const gate = field.enabledBy
    const kind = controlFor(field)
    return {
      key,
      label: text?.(`config.${key}.title`) ?? field.title ?? key,
      description: text?.(`config.${key}.description`) ?? field.description,
      group: field.group,
      kind,
      // A value nobody can type is never "required" of the reader, whatever the schema says.
      required: required.has(key) && kind !== 'readonly',
      signature: signatureFor(key, field, choices),
      deviceLocal: isDeviceLocal(field),
      choices,
      min: field.minimum,
      max: field.maximum,
      step: field.multipleOf ?? (field.type === 'integer' ? 1 : undefined),
      unit: text?.(`config.${key}.unit`) ?? field.unit,
      unitFor: (count: number) => text?.(`config.${key}.unit`, { count }) ?? field.unit,
      maxLength: field.maxLength,
      pattern: field.pattern,
      disabled: gate !== undefined && values[gate] !== true,
      disabledBy: gate,
    }
  })
}

// Groups in declaration order, so the schema's own ordering is what the page shows. Fields with no
// group lead, under no header — the common case is a handful of settings that need no sectioning.
// `group` is an id; the header reads `config.groups.<id>` from the owner's catalog, else the id itself.
export function groupFields(fields: FieldModel[], text?: FieldTextResolver): { id?: string; title?: string; fields: FieldModel[] }[] {
  const groups: { id?: string; title?: string; fields: FieldModel[] }[] = []
  for (const field of fields) {
    // Not `.at(-1)`: the app instance's tsconfig targets a lib without it (see AGENTS.md, 18-delivery Q-07).
    const last = groups[groups.length - 1]
    if (last && last.id === field.group) last.fields.push(field)
    else {
      const id = field.group
      groups.push({ id, title: id == null ? undefined : (text?.(`config.groups.${id}`) ?? id), fields: [field] })
    }
  }
  return groups
}

// Whether the current values contain a validation failure that should block a save — the same rule
// `ConfigForm` uses to decide whether to draw a field's error message under it, asked here instead of
// inline so the save gate cannot drift from what is actually highlighted. A required field that is
// simply what shipped on disk is not a mistake until someone has touched it, so an untouched field
// never counts here even when `validate` would reject its (still unedited) value.
export function hasBlockingErrors(fields: FieldModel[], values: Record<string, unknown>, touched: ReadonlySet<string>): boolean {
  return fields.some((field) => touched.has(field.key) && validate(field, values[field.key]) != null)
}

// Returns the message to show under the control, or null when the value passes. Mirrors the subset
// of JSON Schema the controls can produce — the file on disk is still validated by TypeBox on write.
export function validate(field: FieldModel, value: unknown): string | null {
  if (field.disabled) return null

  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (field.required && empty) return t('validation.required', { name: field.label })
  if (empty) return null

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return t('validation.notANumber')
    if (field.min !== undefined && value < field.min) return t('validation.min', { min: field.min })
    if (field.max !== undefined && value > field.max) return t('validation.max', { max: field.max })
  }

  if (typeof value === 'string') {
    if (field.maxLength !== undefined && value.length > field.maxLength) return t('validation.maxLength', { max: field.maxLength })
    if (field.pattern && !new RegExp(field.pattern).test(value)) return t('validation.pattern')
  }

  return null
}
