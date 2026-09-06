import { describe, expect, it } from 'vitest'
import { schema } from '../editor-schema'
import { BLOCKS, HISTORY, LISTS, MARKS } from '../ui/toolbar-actions'

// A name the schema does not have resolves to `undefined`, and only fails at render time, deep inside
// ProseMirror, as `Cannot read properties of undefined (reading 'isInSet')`. That is how Bold and Italic
// shipped pointing at `bold` and `italic` while the schema calls them `strong` and `em`: neither button
// ever worked, and opening a note took the toolbar down with it.
//
// These read the toolbar's OWN tables rather than a list of names copied into the test — a button added
// later is covered without anyone remembering to add it here, which was the whole failure mode.
describe('editor toolbar against the schema', () => {
  it('every mark it puts a button on exists', () => {
    expect(MARKS.length).toBeGreaterThan(0)
    for (const action of MARKS) {
      expect(action.mark, `"${action.label}" names a mark the schema does not have`).toBeDefined()
    }
  })

  it('every block and list command builds without reaching for a missing node', () => {
    expect(BLOCKS.length + LISTS.length).toBeGreaterThan(0)
    // `setBlockType`/`wrapInList` throw on an undefined node type, so building the command is the check.
    for (const action of [...BLOCKS, ...LISTS]) {
      expect(() => action.run(), `"${action.label}" names a node the schema does not have`).not.toThrow()
    }
  })

  it('every action carries an icon, never a letter standing in for one', () => {
    for (const action of [...MARKS, ...BLOCKS, ...LISTS, ...HISTORY]) {
      expect(action.icon, `"${action.label}" has no icon`).toMatch(/^lu:[a-z0-9-]+$/)
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
