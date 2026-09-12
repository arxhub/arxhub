import { history, undo } from 'prosemirror-history'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { emptyDoc } from '../editor-format'
import { buildKeymap } from '../editor-keymap'
import { editorModeKey, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { BLOCK_COMMANDS, runSlashCommand, slashCommands, slashKey } from '../slash-commands'

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

  it('does not delete text when a block cannot be inserted', () => {
    let state = editor()
    state = state.apply(state.tr.insertText('keep'))
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)).insertText('/'))
    const original = state
    const select = BLOCK_COMMANDS.find((command) => command.id === 'select')
    expect(select).toBeDefined()
    if (!select) return
    expect(
      runSlashCommand(
        state,
        (tr) => {
          state = state.apply(tr)
        },
        select,
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
