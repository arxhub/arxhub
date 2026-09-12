import { EditorState, Plugin, PluginKey } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { insertBlock } from '../block-actions'
import { schema } from '../editor-schema'
import { BLOCK_COMMANDS, runSlashCommand, slashCommands } from '../slash-commands'

const selected = new PluginKey<string>('inserted-component')
const insertion = {
  id: 'component',
  label: 'Component',
  icon: 'lu:box',
  keywords: '',
  run: (state: EditorState, dispatch?: (tr: EditorState['tr']) => void) => {
    dispatch?.(state.tr.setBlockType(state.selection.from, state.selection.to, schema.nodes.heading).setMeta(selected, 'component'))
    return true
  },
}

function editor() {
  const observed: string[] = []
  const plugins = [
    slashCommands(),
    new Plugin({
      key: selected,
      state: { init: () => '', apply: (tr, previous) => tr.getMeta(selected) ?? previous },
      appendTransaction: (_transactions, _before, state) => {
        observed.push(state.doc.firstChild?.type.name ?? '')
        if (state.doc.firstChild?.type === schema.nodes.paragraph && state.doc.firstChild.content.size === 0) {
          return state.tr.insertText('Normalization must not run on the intermediate paragraph', 1)
        }
        return null
      },
    }),
  ]
  return { state: EditorState.create({ schema, plugins }), observed }
}

describe('insertion with contributing ProseMirror plugins', () => {
  it('slash passes only the completed document to appendTransaction and retains command metadata', () => {
    const setup = editor()
    let state = setup.state.apply(setup.state.tr.insertText('/component'))
    setup.observed.length = 0
    expect(
      runSlashCommand(
        state,
        (tr) => {
          state = state.apply(tr)
        },
        insertion,
      ),
    ).toBe(true)
    expect(state.doc.firstChild?.type.name).toBe('heading')
    expect(state.doc.textContent).toBe('')
    expect(selected.getState(state)).toBe('component')
    expect(setup.observed).toEqual(['heading'])
  })

  it('explicit insertion does not expose its empty paragraph to the normalization plugin', () => {
    const setup = editor()
    let state = setup.state
    expect(
      insertBlock(insertion)(state, (tr) => {
        state = state.apply(tr)
      }),
    ).toBe(true)
    expect(state.doc.textContent).toBe('')
    expect(selected.getState(state)).toBe('component')
    expect(setup.observed).toEqual(['heading'])
  })

  it('all builtin commands compose with staged trigger deletion', () => {
    for (const command of BLOCK_COMMANDS) {
      let state = EditorState.create({ schema, plugins: [slashCommands()] })
      state = state.apply(state.tr.insertText('/anything'))
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
      expect(state.doc.textContent).toBe('')
      state.doc.check()
    }
  })
})
