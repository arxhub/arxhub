import { history } from '@codemirror/commands'
import { EditorState, type Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { describe, expect, test } from 'vitest'
import { historyActions, MARKDOWN_ACTIONS, markdownActions } from '../markdown-actions'

// The commands read `state` and call `dispatch`; a real view would need a DOM this suite does not have.
function fakeView(doc: string): EditorView {
  const view = {
    state: EditorState.create({ doc, extensions: [history()] }),
    dispatch(tr: Transaction) {
      view.state = tr.state
    },
    focus() {},
  }
  return view as unknown as EditorView
}

describe('markdownActions', () => {
  test('keeps the desktop order and marks what earns a key on the phone', () => {
    const actions = markdownActions(null)

    expect(actions.map((action) => action.label)).toEqual(MARKDOWN_ACTIONS.map((action) => action.label()))
    expect(actions.filter((action) => action.primary).map((action) => action.label)).toEqual([
      'Heading 1',
      'Bold',
      'Italic',
      'Bulleted list',
      'Task list',
      'Link',
    ])
  })

  test('without a view nothing is active and running does nothing', () => {
    const actions = markdownActions(null)

    expect(actions.some((action) => action.active)).toBe(false)
    expect(() => actions[0]?.run()).not.toThrow()
  })
})

describe('historyActions', () => {
  test('undo is available only once there is something to undo', () => {
    const view = fakeView('text')
    expect(historyActions(view).map((action) => action.disabled)).toEqual([true, true])

    view.dispatch(view.state.update({ changes: { from: 4, insert: '!' } }))
    const [undo, redo] = historyActions(view)
    expect(undo?.disabled).toBe(false)
    expect(redo?.disabled).toBe(true)

    undo?.run()
    expect(view.state.doc.toString()).toBe('text')
    expect(historyActions(view)[1]?.disabled).toBe(false)
  })
})
