import { actionMenu } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { changeBlock } from '../block-actions'

export function openBlockMenu(view: EditorView, x: number, y: number): void {
  const items = [
    { id: 'up', label: 'Move block up', icon: 'lu:arrow-up' },
    { id: 'down', label: 'Move block down', icon: 'lu:arrow-down' },
    { id: 'duplicate', label: 'Duplicate block', icon: 'lu:copy' },
    { id: 'delete', label: 'Delete block', icon: 'lu:trash-2' },
  ] as const
  actionMenu.open(
    items.map((item) => ({
      ...item,
      variant: item.id === 'delete' ? 'danger' : 'default',
      disabled: !changeBlock(item.id)(view.state),
      onSelect: () => {
        if (view.isDestroyed) return
        changeBlock(item.id)(view.state, view.dispatch)
        view.focus()
      },
    })),
    { title: 'Current block', x, y },
  )
}
