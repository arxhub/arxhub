import { describe, expect, it } from 'vitest'
import { schema } from '../editor-schema'

// The toolbar names its marks and nodes by hand, and a name that is not in the schema resolves to
// `undefined` — which only fails at render time, deep inside ProseMirror, as `Cannot read properties of
// undefined (reading 'isInSet')`. That is how Bold and Italic shipped pointing at `bold` and `italic`
// while the schema calls them `strong` and `em`: neither button ever worked, and opening a note took the
// toolbar down with it. These tests are the cheap version of that discovery.
describe('editor schema', () => {
  it('has every mark the toolbar puts a button on', () => {
    for (const name of ['strong', 'em', 'strike', 'underline', 'code']) {
      expect(schema.marks[name], `mark "${name}" is missing from the schema`).toBeDefined()
    }
  })

  it('has every node the toolbar switches a block to', () => {
    for (const name of ['heading', 'paragraph', 'bullet_list', 'ordered_list', 'blockquote']) {
      expect(schema.nodes[name], `node "${name}" is missing from the schema`).toBeDefined()
    }
  })

  // The index reads `.arx` by walking this shape (packages/sql/src/arx.ts): a nested list lives inside
  // the item it hangs off, so `list_item` must accept a block, not text alone. A change here silently
  // changes what nesting depth the index can see.
  it('lets a list item hold the nested list the parser walks into', () => {
    expect(schema.nodes.list_item.spec.content).toBe('paragraph block*')
    expect(schema.nodes.task_list.spec.content).toBe('task_item+')
  })
})
