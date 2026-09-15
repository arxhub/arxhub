import { type ArxJsonNode, isRecord } from './document-migrations'

// The one node type user metadata lives in inside a document (A-48): tags, a favourite flag and
// key/value fields. `editor-schema.ts`'s `doc` content is `block+`, which cannot say "an optional FIRST
// block" — so "at most one, and only at the top" is a rule these functions enforce, not the schema.
export const PROPERTIES_NODE_TYPE = 'properties'

export interface PropertyField {
  key: string
  value: string
}

// Display-only in the UI: which file this card is about. Absent on a document's own in-place
// properties block; present when the block sits in a `<file>.arx` card beside a non-.arx file.
export interface PropertiesSubject {
  fileId?: string
  path?: string
}

export interface PropertiesAttrs {
  tags: string[]
  favorite: boolean
  fields: PropertyField[]
  subject?: PropertiesSubject
}

export function emptyPropertiesAttrs(subject?: PropertiesSubject): PropertiesAttrs {
  return { tags: [], favorite: false, fields: [], ...(subject ? { subject } : {}) }
}

function propertiesBlockOf(doc: ArxJsonNode): ArxJsonNode | null {
  const content = Array.isArray(doc.content) ? doc.content : []
  const first = content[0]
  return isRecord(first) && first.type === PROPERTIES_NODE_TYPE ? first : null
}

export function hasProperties(doc: ArxJsonNode): boolean {
  return propertiesBlockOf(doc) != null
}

// Reads the document's properties for the index and for anything else that only has the JSON, not a
// live ProseMirror node — tolerant of a hand-built or partially-written doc: every field is normalised
// rather than trusted, the same way parse-document.ts trusts nothing about a file's bytes.
export function propertiesOf(doc: ArxJsonNode): PropertiesAttrs | null {
  const block = propertiesBlockOf(doc)
  if (block == null) return null
  return normalizeAttrs(isRecord(block.attrs) ? block.attrs : {})
}

function normalizeAttrs(attrs: Record<string, unknown>): PropertiesAttrs {
  const tags = Array.isArray(attrs.tags) ? attrs.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const favorite = attrs.favorite === true
  const fields = Array.isArray(attrs.fields)
    ? attrs.fields.filter(
        (field): field is PropertyField => isRecord(field) && typeof field.key === 'string' && typeof field.value === 'string',
      )
    : []
  const rawSubject = isRecord(attrs.subject) ? attrs.subject : null
  const subject: PropertiesSubject = {
    ...(typeof rawSubject?.fileId === 'string' ? { fileId: rawSubject.fileId } : {}),
    ...(typeof rawSubject?.path === 'string' ? { path: rawSubject.path } : {}),
  }
  return { tags, favorite, fields, ...(Object.keys(subject).length ? { subject } : {}) }
}

// Inserts a `properties` block at the very top of the document when it does not already have one there
// — the slash command and the explorer's card creation share this rule so a freshly created card and a
// live insertion agree on what "ensured" means. Existing content is never reordered or dropped.
export function ensureProperties(doc: ArxJsonNode, subject?: PropertiesSubject): ArxJsonNode {
  if (hasProperties(doc)) return doc
  const content = Array.isArray(doc.content) ? doc.content : []
  const block: ArxJsonNode = { type: PROPERTIES_NODE_TYPE, attrs: emptyPropertiesAttrs(subject) }
  return { ...doc, content: [block, ...content] }
}

// Pure attribute transforms — the same rules the live node view's `change()` calls use, kept here as one
// unit test each rather than a ProseMirror transaction apiece.
export function withTag(attrs: PropertiesAttrs, tag: string): PropertiesAttrs {
  const trimmed = tag.trim()
  if (trimmed === '' || attrs.tags.includes(trimmed)) return attrs
  return { ...attrs, tags: [...attrs.tags, trimmed] }
}

export function withoutTag(attrs: PropertiesAttrs, tag: string): PropertiesAttrs {
  if (!attrs.tags.includes(tag)) return attrs
  return { ...attrs, tags: attrs.tags.filter((existing) => existing !== tag) }
}

export function toggleFavorite(attrs: PropertiesAttrs): PropertiesAttrs {
  return { ...attrs, favorite: !attrs.favorite }
}

export function withField(attrs: PropertiesAttrs, index: number, patch: Partial<PropertyField>): PropertiesAttrs {
  if (index < 0 || index >= attrs.fields.length) return attrs
  return { ...attrs, fields: attrs.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)) }
}

export function addField(attrs: PropertiesAttrs): PropertiesAttrs {
  return { ...attrs, fields: [...attrs.fields, { key: '', value: '' }] }
}

export function withoutField(attrs: PropertiesAttrs, index: number): PropertiesAttrs {
  return { ...attrs, fields: attrs.fields.filter((_, i) => i !== index) }
}
