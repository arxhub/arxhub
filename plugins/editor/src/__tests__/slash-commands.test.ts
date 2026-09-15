import { history, undo } from 'prosemirror-history'
import type { Node } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { emptyDoc } from '../editor-format'
import { buildKeymap } from '../editor-keymap'
import { editorModeKey, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { BLOCK_COMMANDS, canRunSlashCommand, runSlashCommand, slashCommands, slashKey } from '../slash-commands'

function editor() {
  return EditorState.create({ doc: emptyDoc(schema), plugins: [modePlugin('editable'), slashCommands(), history()] })
}

describe('slash insertion', () => {
  it('inserts every offered block as a valid document with no trigger left behind', () => {
    for (const command of BLOCK_COMMANDS) {
      let state = editor()
      state = state.apply(state.tr.insertText('/'))
      expect(
        runSlashCommand(
          state,
          (tr) => {
            state = state.apply(tr)
          },
          command,
        ),
        command.id,
      ).toBe(true)
      expect(() => state.doc.check()).not.toThrow()
      expect(state.doc.textContent).toBe('')
      expect(slashKey.getState(state)).toBeNull()
      expect(state.selection.$from.parent.isTextblock).toBe(true)
    }
  })

  it('inside a task keeps the list whole: a leaf lands after the task text, nothing else breaks the item', () => {
    const task = (text: string) =>
      schema.node('doc', null, [
        schema.node(
          'task_list',
          null,
          schema.node('task_item', { checked: true }, schema.node('paragraph', null, text ? schema.text(text) : null)),
        ),
      ])
    const leaves: Record<string, string> = {
      divider: 'horizontal_rule',
      'data-view': 'data_view',
      select: 'select',
      image: 'image_block',
      attachment: 'attachment',
    }
    for (const text of ['Done', '']) {
      for (const command of BLOCK_COMMANDS) {
        let state = EditorState.create({ doc: task(text), plugins: [modePlugin('editable'), slashCommands(), history()] })
        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)).insertText('/x'))
        expect(slashKey.getState(state)?.query, command.id).toBe('x')
        const before = state
        const ran = runSlashCommand(
          state,
          (tr) => {
            state = state.apply(tr)
          },
          command,
        )
        expect(() => state.doc.check(), command.id).not.toThrow()
        const lists: Node[] = []
        state.doc.descendants((node) => {
          if (node.type.name === 'task_list') lists.push(node)
        })
        expect(lists, command.id).toHaveLength(1)
        expect(lists[0].childCount, command.id).toBe(1)
        expect(lists[0].firstChild?.attrs.checked, command.id).toBe(true)
        expect(state.selection.$from.parent.isTextblock, command.id).toBe(true)
        if (Object.hasOwn(leaves, command.id)) {
          expect(ran, command.id).toBe(true)
          const item = lists[0].firstChild
          expect(item?.firstChild?.textContent, command.id).toBe(text)
          expect(item?.child(1).type.name, command.id).toBe(leaves[command.id])
          expect(item?.childCount, command.id).toBe(3)
          expect(item?.lastChild?.type.name, command.id).toBe('paragraph')
          expect(state.selection.$from.parent, command.id).toBe(item?.lastChild)
          expect(state.doc.textContent, command.id).toBe(text)
        } else if (!ran) {
          expect(state, command.id).toBe(before)
        }
      }
    }
  })

  it('one undo restores the trigger and the original block', () => {
    let state = editor()
    state = state.apply(state.tr.insertText('/task'))
    const original = state.doc
    const task = BLOCK_COMMANDS.find((command) => command.id === 'task-list')
    expect(task).toBeDefined()
    if (!task) return
    runSlashCommand(
      state,
      (tr) => {
        state = state.apply(tr)
      },
      task,
    )
    expect(state.doc.firstChild?.type.name).toBe('task_list')
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(original)).toBe(true)
  })

  it('does not open inside normal text or code, and closes on mode change or escape', () => {
    let state = editor()
    state = state.apply(state.tr.insertText('path/to'))
    expect(slashKey.getState(state)).toBeNull()
    state = editor()
    state = state.apply(state.tr.insertText('/head'))
    expect(slashKey.getState(state)?.query).toBe('head')
    state = state.apply(state.tr.setMeta(slashKey, 'dismiss'))
    state = state.apply(state.tr.setSelection(state.selection))
    expect(slashKey.getState(state)).toBeNull()
    state = state.apply(state.tr.insertText('i'))
    state = state.apply(state.tr.setMeta(editorModeKey, 'interactive'))
    expect(slashKey.getState(state)).toBeNull()
    state = EditorState.create({ schema, doc: schema.node('doc', null, schema.nodes.code_block.create()), plugins: [slashCommands()] })
    state = state.apply(state.tr.insertText('/'))
    expect(slashKey.getState(state)).toBeNull()
  })

  it('inserts a leaf after a paragraph that still has text, and puts the caret in a fresh paragraph', () => {
    let state = editor()
    state = state.apply(state.tr.insertText('keep'))
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)).insertText('/drop'))
    const original = state.doc
    const select = BLOCK_COMMANDS.find((command) => command.id === 'select')
    expect(select).toBeDefined()
    if (!select) return
    expect(canRunSlashCommand(state, select)).toBe(true)
    expect(
      runSlashCommand(
        state,
        (tr) => {
          state = state.apply(tr)
        },
        select,
      ),
    ).toBe(true)
    expect(() => state.doc.check()).not.toThrow()
    expect(state.doc.childCount).toBe(3)
    expect(state.doc.child(0).textContent).toBe('keep')
    expect(state.doc.child(1).type.name).toBe('select')
    expect(state.doc.child(2).type.name).toBe('paragraph')
    expect(state.selection.$from.parent).toBe(state.doc.child(2))
    expect(slashKey.getState(state)).toBeNull()
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(original)).toBe(true)
  })

  it('reports a command that cannot run, and leaves the text alone when asked to run it anyway', () => {
    // A task's first child must stay a paragraph, so a heading typed inside one has nowhere to go.
    let state = EditorState.create({
      doc: schema.node('doc', null, [
        schema.node('task_list', null, schema.node('task_item', null, schema.node('paragraph', null, schema.text('keep')))),
      ]),
      plugins: [modePlugin('editable'), slashCommands(), history()],
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)).insertText('/head'))
    const original = state
    const heading = BLOCK_COMMANDS.find((command) => command.id === 'heading-1')
    expect(heading).toBeDefined()
    if (!heading) return
    expect(canRunSlashCommand(state, heading)).toBe(false)
    expect(
      runSlashCommand(
        state,
        (tr) => {
          state = state.apply(tr)
        },
        heading,
      ),
    ).toBe(false)
    expect(state).toBe(original)
  })

  it('Enter continues a task list, then exits an empty task', () => {
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('task_list', null, schema.node('task_item', { checked: true }, schema.node('paragraph', null, schema.text('Done')))),
      ]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7)))
    const enter = buildKeymap(schema).Enter
    enter(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.childCount).toBe(2)
    expect(state.doc.firstChild?.lastChild?.attrs.checked).toBe(false)
    enter(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.lastChild?.type.name).toBe('paragraph')
    expect(state.doc.firstChild?.childCount).toBe(1)
  })
})
