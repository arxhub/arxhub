import { validation } from '@arxhub/errors'

export type ArxJsonNode = Record<string, unknown>
export interface ArxDataVersion {
  id: string
  version: number
  nodes: readonly string[]
  marks: readonly string[]
  migrations: Readonly<Record<number, (node: ArxJsonNode) => ArxJsonNode>>
}
export interface ArxFormatConfig {
  versions: readonly ArxDataVersion[]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function migrateDocument(
  doc: ArxJsonNode,
  stored: unknown,
  config?: ArxFormatConfig,
  known?: { nodes: readonly string[]; marks: readonly string[] },
): { doc: ArxJsonNode; versions: Record<string, number>; future: Set<string> } {
  if (stored !== undefined && (!isRecord(stored) || Object.values(stored).some((value) => !Number.isSafeInteger(value) || Number(value) < 1)))
    throw validation('Invalid editor plugin data versions')
  const versions: Record<string, number> = { ...(stored as Record<string, number> | undefined) }
  const future = new Set<string>()
  const used = new Set<string>()
  const collect = (value: unknown, mark = false): void => {
    if (!isRecord(value)) return
    used.add(`${mark ? 'mark' : 'node'}:${value.type}`)
    if (Array.isArray(value.content)) for (const child of value.content) collect(child)
    if (Array.isArray(value.marks)) for (const child of value.marks) collect(child, true)
  }
  collect(doc)
  const needsMigration = config?.versions.some(
    (owner) =>
      (Object.hasOwn(versions, owner.id) ? versions[owner.id] : 1) < owner.version &&
      (owner.nodes.some((name) => used.has(`node:${name}`)) || owner.marks.some((name) => used.has(`mark:${name}`))),
  )
  if (needsMigration && known) {
    const nodes = new Set([...known.nodes, ...(config?.versions.flatMap((owner) => owner.nodes) ?? [])])
    const marks = new Set([...known.marks, ...(config?.versions.flatMap((owner) => owner.marks) ?? [])])
    const compatible = (value: unknown, mark = false): boolean => {
      if (!isRecord(value) || !(mark ? marks : nodes).has(String(value.type))) return false
      return (
        (!Array.isArray(value.content) || value.content.every((child) => compatible(child))) &&
        (!Array.isArray(value.marks) || value.marks.every((child) => compatible(child, true)))
      )
    }
    if (!compatible(doc) || config?.versions.some((owner) => Object.hasOwn(versions, owner.id) && versions[owner.id] > owner.version)) {
      throw validation('Enable compatible versions of all document plugins before migrating this document. The original file has not changed.')
    }
  }
  let result = doc
  for (const owner of config?.versions ?? []) {
    const from = Object.hasOwn(versions, owner.id) ? versions[owner.id] : 1
    if (from > owner.version) {
      for (const name of owner.nodes) future.add(`node:${name}`)
      for (const name of owner.marks) future.add(`mark:${name}`)
      continue
    }
    const visit = (value: ArxJsonNode, mark = false): ArxJsonNode => {
      let next = { ...value }
      if (Array.isArray(value.content)) next.content = value.content.map((child) => (isRecord(child) ? visit(child) : child))
      if (Array.isArray(value.marks)) next.marks = value.marks.map((child) => (isRecord(child) ? visit(child, true) : child))
      if ((mark ? owner.marks : owner.nodes).includes(String(value.type))) {
        for (let version = from; version < owner.version; version++) {
          const migrate = owner.migrations[version]
          if (!migrate) throw validation(`Missing data migration ${owner.id}: ${version} → ${version + 1}`)
          try {
            next = migrate(structuredClone(next))
          } catch (error) {
            throw validation(`Data migration failed for ${owner.id}: ${error instanceof Error ? error.message : String(error)}`)
          }
          if (!isRecord(next) || typeof next.type !== 'string') throw validation(`Invalid migration result for ${owner.id}`)
        }
      }
      return next
    }
    if (from < owner.version) result = visit(result)
    Object.defineProperty(versions, owner.id, { value: owner.version, enumerable: true, configurable: true, writable: true })
  }
  return { doc: result, versions, future }
}
