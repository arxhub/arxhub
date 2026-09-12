import { illegalState } from '@arxhub/errors'
import type { Command, EditorState, Transaction } from 'prosemirror-state'

// Preparation is not an editor update: appendTransaction and filterTransaction must see the
// completed insertion only. The supplied transaction also retains metadata set by plugin commands.
export function runPreparedCommand(state: EditorState, transaction: Transaction, command: Command): boolean {
  const { doc, selection, storedMarks } = transaction
  const prepared = new Proxy(state, {
    get(target, property, receiver) {
      if (property === 'doc') return doc
      if (property === 'selection') return selection
      if (property === 'storedMarks') return storedMarks
      if (property === 'tr') return transaction
      return Reflect.get(target, property, receiver)
    },
  })
  return command(prepared, (result) => {
    if (result !== transaction) throw illegalState('ArxEditor insertion commands must dispatch the supplied state.tr')
  })
}
