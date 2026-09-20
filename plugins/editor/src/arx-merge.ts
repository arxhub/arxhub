import { validation } from '@arxhub/errors'
import { type Node, Schema } from 'prosemirror-model'
import { identityNodes } from './block-identity'
import { isRecord } from './document-migrations'
import { deserialize, serialize } from './editor-format'
import { schema as baseSchema } from './editor-schema'
import { BASE_FORMAT } from './select-options'
import { comparable } from './version-diff'

// The schema this merge runs against: the base editor schema (the same one `md-to-arx.ts` builds
// against, for the same reason — this is a pure module with no live `ArxEditorExtension` to ask), but
// with `arxId` reserved on every block the way the live composed schema always has it (`seal()` in
// editor-extension.ts). Without that, parsing a document through the raw base `schema` would silently
// drop every block's `arxId` attribute — and matching blocks across base/local/remote is the whole
// point. A node type a live session actually has (from a plugin contribution this module knows nothing
// about) that this schema does not is exactly what `unknown_block` already exists to hold: it folds in
// wholesale, `arxId` and all, and is compared and moved as one opaque unit — which is also how nested
// containers (a section, a list) are treated below, deliberately, not as a limitation of this schema.
const mergeSchema = new Schema({ nodes: identityNodes(baseSchema.spec.nodes), marks: baseSchema.spec.marks })

interface Block {
  id: string
  node: Node
}

// Top-level children only. version-diff.ts's own matching (used for the saved-version diff) does not
// recurse into a container either — a change anywhere inside a section is a change of the section — so
// a three-way merge follows the same rule rather than inventing a second notion of "how deep a diff
// goes": "deeper structure is compared as a unit" is a single decision, not one this module repeats.
function topBlocks(doc: Node): Block[] {
  const blocks: Block[] = []
  doc.forEach((child) => {
    const id = child.attrs.arxId
    // A block that has never been through the live editor (identifyBlocks assigns arxId on first
    // open — see block-identity.ts) has no id yet. It is matched by position instead, as a fallback:
    // worse than an id match, but the common case never reaches it.
    blocks.push({ id: typeof id === 'string' && id ? id : `#${blocks.length}`, node: child })
  })
  return blocks
}

function predecessors(blocks: readonly Block[]): Map<string, string | null> {
  const map = new Map<string, string | null>()
  let previous: string | null = null
  for (const block of blocks) {
    map.set(block.id, previous)
    previous = block.id
  }
  return map
}

function conflictNode(kind: 'edit-edit' | 'edit-delete', local: Node | null, remote: Node | null): Node {
  const side = (name: 'local' | 'remote', block: Node | null) => mergeSchema.nodes.conflict_side.create({ side: name }, block ? [block] : [])
  return mergeSchema.nodes.conflict.create({ kind }, [side('local', local), side('remote', remote)])
}

export function mergeArx(base: string | null, local: string, remote: string): { merged: string; conflicts: number } {
  const localDoc = deserialize(mergeSchema, local, BASE_FORMAT)
  const remoteDoc = deserialize(mergeSchema, remote, BASE_FORMAT)
  const baseDoc = base != null ? deserialize(mergeSchema, base, BASE_FORMAT) : null

  const localBlocks = topBlocks(localDoc)
  const remoteBlocks = topBlocks(remoteDoc)
  const baseBlocks = baseDoc ? topBlocks(baseDoc) : []

  const localById = new Map(localBlocks.map((block) => [block.id, block.node] as const))
  const remoteById = new Map(remoteBlocks.map((block) => [block.id, block.node] as const))
  const baseById = new Map(baseBlocks.map((block) => [block.id, block.node] as const))

  let conflicts = 0
  // Absent from this map after the loop below means "removed" — there is no separate tombstone value,
  // the id is simply left out of the final order built afterwards.
  const resolved = new Map<string, Node>()
  const allIds = new Set<string>([...baseById.keys(), ...localById.keys(), ...remoteById.keys()])

  for (const id of allIds) {
    const baseNode = baseById.get(id) ?? null
    const localNode = localById.get(id) ?? null
    const remoteNode = remoteById.get(id) ?? null

    if (baseNode) {
      const localRemoved = !localNode
      const remoteRemoved = !remoteNode
      const localChanged = !localRemoved && !comparableEq(localNode, baseNode)
      const remoteChanged = !remoteRemoved && !comparableEq(remoteNode, baseNode)

      if (localRemoved && remoteRemoved) continue // removed on both -> removed
      if (localRemoved || remoteRemoved) {
        // Removed on one side, present (possibly changed) on the other.
        const changed = localRemoved ? remoteChanged : localChanged
        if (changed) {
          resolved.set(id, conflictNode('edit-delete', localRemoved ? null : localNode, remoteRemoved ? null : remoteNode))
          conflicts++
        }
        // else: removed on one side, unchanged on the other -> removed (nothing to set).
        continue
      }
      // Present on both.
      if (!localChanged && !remoteChanged) {
        resolved.set(id, baseNode)
      } else if (localChanged && !remoteChanged) {
        resolved.set(id, localNode)
      } else if (!localChanged && remoteChanged) {
        resolved.set(id, remoteNode)
      } else if (comparableEq(localNode, remoteNode)) {
        resolved.set(id, localNode) // changed on both, to the same thing
      } else {
        resolved.set(id, conflictNode('edit-edit', localNode, remoteNode))
        conflicts++
      }
      continue
    }

    // Not in base: added on one side, or (rarely) on both under the same id.
    if (localNode && remoteNode) {
      if (comparableEq(localNode, remoteNode)) {
        resolved.set(id, localNode)
      } else {
        resolved.set(id, conflictNode('edit-edit', localNode, remoteNode))
        conflicts++
      }
    } else if (localNode) {
      resolved.set(id, localNode)
    } else if (remoteNode) {
      resolved.set(id, remoteNode)
    }
  }

  // Order: base order first (whatever of it survived), then each side's additions spliced in right
  // after their own predecessor — local's first, then remote's, so a tie (both sides adding after the
  // same anchor) lands remote closest to the anchor, ahead of local's addition (spec: "remote order
  // wins for ties").
  const order = baseBlocks.map((block) => block.id).filter((id) => resolved.has(id))
  const insertNew = (blocks: readonly Block[], preds: Map<string, string | null>) => {
    for (const block of blocks) {
      if (!resolved.has(block.id) || order.includes(block.id)) continue
      const predecessor = preds.get(block.id) ?? null
      const anchor = predecessor ? order.indexOf(predecessor) : -1
      order.splice(anchor + 1, 0, block.id)
    }
  }
  insertNew(localBlocks, predecessors(localBlocks))
  insertNew(remoteBlocks, predecessors(remoteBlocks))

  const attrs = mergeMetadata(baseDoc?.attrs, localDoc.attrs, remoteDoc.attrs) as Record<string, unknown>
  // `doc`'s content is `block+` — both sides removing every block (rare: it means nothing survived
  // anywhere) would otherwise build a doc `.check()` refuses the moment it is saved or re-opened.
  const content = order.length ? order.map((id) => resolved.get(id)!) : [mergeSchema.nodes.paragraph.create()]
  const mergedDoc = mergeSchema.topNodeType.create(attrs, content)
  return { merged: serialize(mergedDoc, BASE_FORMAT), conflicts }
}

function comparableEq(a: Node, b: Node): boolean {
  return comparable(a) === comparable(b)
}

// Page decoration and unknown envelope fields must survive independent body edits. A collision
// between two values cannot be represented by a body conflict block: let the repository keep both
// complete files through its existing conflict-copy fallback instead of silently choosing one.
function mergeMetadata(base: unknown, local: unknown, remote: unknown): unknown {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (same(local, remote)) return local
  if (same(local, base)) return remote
  if (same(remote, base)) return local
  if (isRecord(local) && isRecord(remote)) {
    const previous = isRecord(base) ? base : {}
    return Object.fromEntries(
      [...new Set([...Object.keys(previous), ...Object.keys(local), ...Object.keys(remote)])].map((key) => [
        key,
        mergeMetadata(previous[key], local[key], remote[key]),
      ]),
    )
  }
  throw validation('Conflicting document metadata — keep both versions')
}
