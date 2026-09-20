import { validation } from '@arxhub/errors'
import type { Node, Schema } from 'prosemirror-model'
import { type ArxFormatConfig, isRecord, migrateDocument } from './document-migrations'

export function serialize(doc: Node, config?: ArxFormatConfig): string {
  doc.check()
  const metadata = isRecord(doc.attrs.arxEnvelope) ? doc.attrs.arxEnvelope : {}
  const envelope = isRecord(metadata.envelope) ? metadata.envelope : {}
  const root = isRecord(metadata.root) ? metadata.root : {}
  const versions = { ...(isRecord(envelope.plugins) ? envelope.plugins : {}) }
  doc.descendants((node) => {
    if (node.type.name !== 'unknown_block' || !isRecord(node.attrs.versions)) return
    for (const [id, version] of Object.entries(node.attrs.versions)) {
      const previous = Object.hasOwn(versions, id) ? Number(versions[id]) : 1
      Object.defineProperty(versions, id, { value: Math.max(previous, Number(version)), enumerable: true, configurable: true, writable: true })
    }
  })
  for (const owner of config?.versions ?? []) {
    const stored = Object.hasOwn(versions, owner.id) ? Number(versions[owner.id]) : 1
    Object.defineProperty(versions, owner.id, { value: Math.max(stored, owner.version), enumerable: true, configurable: true, writable: true })
  }
  const raw = expandJSON(doc.toJSON() as Record<string, unknown>)
  // Page properties stay outside the editable body, but retain their on-disk representation so the
  // index, sidecar cards and older clients see the same metadata rather than a second copy.
  if (isRecord(metadata.properties)) raw.content = [expandJSON(metadata.properties), ...((raw.content as unknown[]) ?? [])]
  delete raw.attrs
  const output = {
    ...envelope,
    version: 1,
    ...(Object.keys(versions).length ? { plugins: versions } : {}),
    doc: { ...raw, ...root, type: 'doc', content: raw.content },
  }
  return JSON.stringify(output, null, 2)
}

function expandJSON(value: Record<string, unknown>): Record<string, unknown> {
  if (value.type === 'unknown_block' && isRecord(value.attrs) && isRecord(value.attrs.raw)) {
    const raw = value.attrs.raw
    return value.attrs.arxId ? { ...raw, attrs: { ...(isRecord(raw.attrs) ? raw.attrs : {}), arxId: value.attrs.arxId } } : raw
  }
  return {
    ...value,
    ...(isRecord(value.attrs) && value.attrs.arxId === null
      ? { attrs: Object.fromEntries(Object.entries(value.attrs).filter(([key]) => key !== 'arxId')) }
      : {}),
    ...(Array.isArray(value.content) ? { content: value.content.map((child) => (isRecord(child) ? expandJSON(child) : child)) } : {}),
  }
}

export function deserialize(schema: Schema, raw: string, config?: ArxFormatConfig): Node {
  const arx: unknown = JSON.parse(raw)
  if (!isRecord(arx) || arx.version !== 1 || !isRecord(arx.doc)) throw validation('Unsupported or invalid .arx document version')
  if (arx.doc.type !== schema.topNodeType.name || !Array.isArray(arx.doc.content)) throw validation('The file must contain an .arx document')
  const migrated = migrateDocument(arx.doc, arx.plugins, config, { nodes: Object.keys(schema.nodes), marks: Object.keys(schema.marks) })
  const content: Node[] = []
  let properties: Record<string, unknown> | undefined
  for (const [index, value] of (migrated.doc.content as unknown[]).entries()) {
    if (!isRecord(value)) throw validation('Invalid document content')
    if (supportedJSON(schema, value, migrated.future)) {
      const node = schema.nodeFromJSON(value)
      node.check()
      if (index === 0 && node.type.name === 'properties') properties = node.toJSON()
      else content.push(node)
    } else {
      if (!schema.nodes.unknown_block) throw validation(`Unsupported document block: ${String(value.type)}`)
      content.push(
        schema.nodes.unknown_block.create({
          raw: value,
          versions: migrated.versions,
          arxId: isRecord(value.attrs) && typeof value.attrs.arxId === 'string' ? value.attrs.arxId : null,
        }),
      )
    }
  }
  const { doc: _doc, version: _version, ...envelope } = arx
  const { type: _type, content: _content, ...root } = arx.doc
  if (Object.keys(migrated.versions).length) envelope.plugins = migrated.versions
  const hasMetadata = properties || Object.keys(envelope).length > 0 || Object.keys(root).length > 0
  if (properties && !content.length) content.push(schema.nodes.paragraph.create())
  const doc = schema.topNodeType.create(
    hasMetadata ? { arxEnvelope: { envelope, root, ...(properties ? { properties } : {}) } } : null,
    content,
  )
  doc.check()
  return doc
}

function supportedJSON(schema: Schema, value: Record<string, unknown>, future: Set<string>, mark = false): boolean {
  const name = value.type
  if (typeof name !== 'string') throw validation('Invalid document node type')
  const type = mark ? schema.marks[name] : schema.nodes[name]
  if (!type || future.has(`${mark ? 'mark' : 'node'}:${name}`)) return false
  if (name === 'unknown_block') return false
  let supported = Object.keys(value).every((key) => ['type', 'attrs', 'content', 'marks', 'text'].includes(key))
  if (value.attrs !== undefined) {
    if (!isRecord(value.attrs)) throw validation(`Invalid attributes for ${name}`)
    supported &&= Object.keys(value.attrs).every((key) => Object.hasOwn(type.spec.attrs ?? {}, key))
  }
  for (const key of ['content', 'marks'] as const) {
    if (value[key] === undefined) continue
    if (!Array.isArray(value[key])) throw validation(`Invalid ${key}`)
    for (const child of value[key]) {
      if (!isRecord(child)) throw validation(`Invalid document ${key}`)
      if (!supportedJSON(schema, child, future, key === 'marks')) supported = false
    }
  }
  return supported
}

export function emptyDoc(schema: Schema): Node {
  return schema.node('doc', null, [schema.node('paragraph')])
}
