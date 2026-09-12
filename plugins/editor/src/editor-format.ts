import { validation } from '@arxhub/errors'
import type { Node, Schema } from 'prosemirror-model'

interface ArxDocument {
  version: number
  doc: Record<string, unknown>
}

export function serialize(doc: Node): string {
  doc.check()
  const arx: ArxDocument = { version: 1, doc: doc.toJSON() as Record<string, unknown> }
  return JSON.stringify(arx, null, 2)
}

export function deserialize(schema: Schema, raw: string): Node {
  const arx: unknown = JSON.parse(raw)
  if (!isRecord(arx) || arx.version !== 1 || !isRecord(arx.doc)) throw validation('Unsupported or invalid .arx document version')
  checkJSON(schema, arx.doc)
  const doc = schema.nodeFromJSON(arx.doc)
  if (doc.type !== schema.topNodeType) throw validation('The file must contain an .arx document')
  doc.check()
  return doc
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// ProseMirror discards unknown attributes when reading JSON. Reject them before normalization,
// otherwise opening a document without its plugin could erase that plugin's data on autosave.
function checkJSON(schema: Schema, value: Record<string, unknown>, mark = false): void {
  const name = value.type
  const type = typeof name === 'string' ? (mark ? schema.marks[name] : schema.nodes[name]) : undefined
  if (!type) throw validation(`Unsupported document ${mark ? 'mark' : 'block'}: ${String(name)}. Enable its editor plugin and retry.`)
  if (value.attrs !== undefined) {
    if (!isRecord(value.attrs)) throw validation(`Invalid attributes for ${name}`)
    for (const key of Object.keys(value.attrs)) {
      if (!Object.hasOwn(type.spec.attrs ?? {}, key)) throw validation(`Unsupported attribute ${String(name)}.${key}`)
    }
  }
  for (const key of ['content', 'marks'] as const) {
    if (value[key] === undefined) continue
    if (!Array.isArray(value[key])) throw validation(`Invalid ${key}`)
    for (const child of value[key]) {
      if (!isRecord(child)) throw validation(`Invalid document ${key}`)
      checkJSON(schema, child, key === 'marks')
    }
  }
}

export function emptyDoc(schema: Schema): Node {
  return schema.node('doc', null, [schema.node('paragraph')])
}
