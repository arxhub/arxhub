import { Schema } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { mergeArx } from '../arx-merge'
import { identityNodes } from '../block-identity'
import { documentId, withDocumentId } from '../document-history'
import { deserialize, serialize } from '../editor-format'
import { schema as base } from '../editor-schema'

// Same construction arx-merge.ts uses internally (a fresh Schema instance with arxId reserved) so a
// merged .arx string can be parsed back and compared structurally — two different Schema instances of
// the same shape are never `.eq()`-compatible, but a round trip through text is: only node NAMES are
// serialized, never a schema reference.
const schema = new Schema({ nodes: identityNodes(base.spec.nodes), marks: base.spec.marks })
const p = (id: string, text = id) => schema.node('paragraph', { arxId: id }, text ? schema.text(text) : undefined)
const section = (id: string, ...blocks: ReturnType<typeof p>[]) => schema.node('section', { arxId: id }, blocks)
const doc = (...blocks: ReturnType<typeof p>[]) => schema.node('doc', null, blocks)
const arx = (...blocks: ReturnType<typeof p>[]) => serialize(doc(...blocks))
// Content only: a merged file also carries the format's version stamps in its envelope
// (`plugins`), which the blocks being compared say nothing about.
const parse = (raw: string) => schema.node('doc', null, deserialize(schema, raw).content)

function conflictSides(node: ReturnType<typeof p>) {
  const conflict = node
  expect(conflict.type.name).toBe('conflict')
  const sides: Record<string, ReturnType<typeof p> | null> = { local: null, remote: null }
  conflict.forEach((child) => {
    sides[String(child.attrs.side)] = child.childCount ? child.child(0) : null
  })
  return sides
}

describe('mergeArx', () => {
  it('keeps a block unchanged on both sides as the base version', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const { merged, conflicts } = mergeArx(b, b, b)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A'), p('b', 'B')))).toBe(true)
  })

  it('takes the changed side when only one side changed a block', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A local'), p('b', 'B'))
    const remote = arx(p('a', 'A'), p('b', 'B'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A local'), p('b', 'B')))).toBe(true)
  })

  it('keeps a block added on one side, in position', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A'), p('x', 'X'), p('b', 'B'))
    const remote = arx(p('a', 'A'), p('b', 'B'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A'), p('x', 'X'), p('b', 'B')))).toBe(true)
  })

  it('places blocks added on both sides after the same predecessor, remote first (ties)', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A'), p('x', 'X'), p('b', 'B'))
    const remote = arx(p('a', 'A'), p('y', 'Y'), p('b', 'B'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A'), p('y', 'Y'), p('x', 'X'), p('b', 'B')))).toBe(true)
  })

  it('removes a block deleted on one side and left unchanged on the other', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A'))
    const remote = arx(p('a', 'A'), p('b', 'B'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A')))).toBe(true)
  })

  it('removes a block deleted on both sides', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A'))
    const remote = arx(p('a', 'A'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A')))).toBe(true)
  })

  it('turns a delete-vs-edit into an edit-delete conflict, keeping the edit as the surviving side', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A')) // b deleted locally
    const remote = arx(p('a', 'A'), p('b', 'B edited')) // b changed remotely
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(1)
    const result = parse(merged)
    expect(result.childCount).toBe(2)
    const conflict = result.child(1)
    expect(conflict.type.name).toBe('conflict')
    expect(conflict.attrs.kind).toBe('edit-delete')
    const sides = conflictSides(conflict)
    expect(sides.local).toBeNull()
    expect(sides.remote?.textContent).toBe('B edited')
  })

  it('turns an edit-vs-delete (the other direction) into the same kind of conflict', () => {
    const b = arx(p('a', 'A'), p('b', 'B'))
    const local = arx(p('a', 'A'), p('b', 'B edited')) // b changed locally
    const remote = arx(p('a', 'A')) // b deleted remotely
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(1)
    const conflict = parse(merged).child(1)
    expect(conflict.attrs.kind).toBe('edit-delete')
    const sides = conflictSides(conflict)
    expect(sides.local?.textContent).toBe('B edited')
    expect(sides.remote).toBeNull()
  })

  it('takes the common result when both sides changed a block to the same thing', () => {
    const b = arx(p('a', 'A'))
    const local = arx(p('a', 'A2'))
    const remote = arx(p('a', 'A2'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(0)
    expect(parse(merged).eq(doc(p('a', 'A2')))).toBe(true)
  })

  it('conflicts when both sides changed a block differently (edit-edit)', () => {
    const b = arx(p('a', 'A'))
    const local = arx(p('a', 'A local'))
    const remote = arx(p('a', 'A remote'))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(1)
    const conflict = parse(merged).child(0)
    expect(conflict.type.name).toBe('conflict')
    expect(conflict.attrs.kind).toBe('edit-edit')
    const sides = conflictSides(conflict)
    expect(sides.local?.textContent).toBe('A local')
    expect(sides.remote?.textContent).toBe('A remote')
  })

  it('compares a nested container as a single unit, not block by block inside it', () => {
    const b = arx(section('s', p('a', 'inside A')))
    // Both sides edit the SAME inner paragraph, to different text — nothing inside the section is
    // itself matched by id across local/remote, so this is one conflicting section, not a merge of
    // its interior.
    const local = serialize(doc(section('s', p('a', 'local text'))))
    const remote = serialize(doc(section('s', p('a', 'remote text'))))
    const { merged, conflicts } = mergeArx(b, local, remote)
    expect(conflicts).toBe(1)
    const conflict = parse(merged).child(0)
    expect(conflict.type.name).toBe('conflict')
    const sides = conflictSides(conflict)
    expect(sides.local?.type.name).toBe('section')
    expect(sides.local?.textContent).toBe('local text')
    expect(sides.remote?.textContent).toBe('remote text')
  })

  it('preserves document metadata (documentId) through a merge', () => {
    const withId = (n: ReturnType<typeof doc>) => withDocumentId(n, '11111111-1111-1111-1111-111111111111')
    const b = serialize(withId(doc(p('a', 'A'))))
    const local = serialize(withId(doc(p('a', 'A local'))))
    const remote = serialize(withId(doc(p('a', 'A'))))
    const { merged } = mergeArx(b, local, remote)
    expect(documentId(deserialize(schema, merged))).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('is idempotent: merging a merged document with itself changes nothing and resolves nothing further', () => {
    const b = arx(p('a', 'A'))
    const local = arx(p('a', 'A local'))
    const remote = arx(p('a', 'A remote'))
    const { merged: once } = mergeArx(b, local, remote)
    const { merged: twice, conflicts } = mergeArx(once, once, once)
    expect(conflicts).toBe(0)
    expect(parse(twice).eq(parse(once))).toBe(true)
  })

  describe('without a base', () => {
    it('conflicts on a differing pair sharing an id, and keeps blocks unique to one side', () => {
      const local = arx(p('a', 'local A'), p('b', 'only local'))
      const remote = arx(p('a', 'remote A'), p('c', 'only remote'))
      const { merged, conflicts } = mergeArx(null, local, remote)
      expect(conflicts).toBe(1)
      const result = parse(merged)
      const kinds = result.children.map((node) => node.type.name)
      expect(kinds).toEqual(['conflict', 'paragraph', 'paragraph'])
      const sides = conflictSides(result.child(0))
      expect(sides.local?.textContent).toBe('local A')
      expect(sides.remote?.textContent).toBe('remote A')
      // Both 'b' (local-only) and 'c' (remote-only) sit right after 'a' in their own document, so this
      // is a tie by the same rule the "ties" test above exercises: remote lands closer to the anchor.
      expect(result.child(1).textContent).toBe('only remote')
      expect(result.child(2).textContent).toBe('only local')
    })

    it('keeps a matching pair without conflict when both sides agree', () => {
      const local = arx(p('a', 'A'))
      const remote = arx(p('a', 'A'))
      const { merged, conflicts } = mergeArx(null, local, remote)
      expect(conflicts).toBe(0)
      expect(parse(merged).eq(doc(p('a', 'A')))).toBe(true)
    })
  })
})
