import type { Node, Schema } from 'prosemirror-model'

interface ArxDocument {
  version: number
  doc: Record<string, unknown>
}

export function serialize(doc: Node): string {
  const arx: ArxDocument = { version: 1, doc: doc.toJSON() as Record<string, unknown> }
  return JSON.stringify(arx, null, 2)
}

export function deserialize(schema: Schema, raw: string): Node {
  const arx = JSON.parse(raw) as ArxDocument
  return schema.nodeFromJSON(arx.doc)
}

export function emptyDoc(schema: Schema): Node {
  return schema.node('doc', null, [schema.node('paragraph')])
}
