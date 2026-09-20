import { type ActionItem, actionMenu } from '@arxhub/uikit/core'
import { isInTable } from 'prosemirror-tables'
import type { EditorView } from 'prosemirror-view'
import { changeBlock, insertParagraphBeside } from '../block-actions'
import { continueAfterBlock } from '../block-navigation'
import { selectBlocks, selectedBlocks } from '../block-selection'
import { BLOCK_TRANSFORMS, transformBlocks } from '../block-transforms'
import { arrangeColumns } from '../columns'
import { buildKeymap } from '../editor-keymap'
import { TABLE_ACTIONS } from '../table-actions'

export function openBlockMenu(view: EditorView, x: number, y: number): void {
  const items = [
    { id: 'up', label: 'Move block up', icon: 'lu:arrow-up' },
    { id: 'down', label: 'Move block down', icon: 'lu:arrow-down' },
    { id: 'duplicate', label: 'Duplicate block', icon: 'lu:copy' },
    { id: 'delete', label: 'Delete block', icon: 'lu:trash-2' },
  ] as const
  actionMenu.open(
    [
      ...[
        { id: 'paragraph-before', label: 'Add paragraph before block', icon: 'lu:arrow-up-to-line', run: insertParagraphBeside('before') },
        { id: 'paragraph-after', label: 'Add paragraph after block', icon: 'lu:arrow-down-to-line', run: insertParagraphBeside('after') },
        { id: 'continue', label: 'Continue outside container', icon: 'lu:corner-down-right', run: continueAfterBlock },
        { id: 'indent', label: 'Indent list item', icon: 'lu:list-indent-increase', run: buildKeymap(view.state.schema).Tab },
        { id: 'outdent', label: 'Outdent list item', icon: 'lu:list-indent-decrease', run: buildKeymap(view.state.schema)['Shift-Tab'] },
        ...(isInTable(view.state) ? TABLE_ACTIONS.filter((action) => action.id !== 'header') : []),
      ].map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        disabled: !action.run(view.state),
        onSelect: () => {
          if (view.isDestroyed) return
          action.run(view.state, view.dispatch)
          view.focus()
        },
      })),
      ...items.map(
        (item): ActionItem => ({
          ...item,
          variant: item.id === 'delete' ? 'danger' : 'default',
          disabled: !changeBlock(item.id)(view.state),
          onSelect: () => {
            if (view.isDestroyed) return
            changeBlock(item.id)(view.state, view.dispatch)
            view.focus()
          },
        }),
      ),
      { id: 'transform', label: 'Turn into', icon: 'lu:repeat-2', onSelect: () => openTransformMenu(view, x, y) },
      ...(
        [
          { id: 'current', label: 'Select block', icon: 'lu:square-dashed' },
          { id: 'parent', label: 'Select parent block', icon: 'lu:corner-left-up' },
          { id: 'next', label: 'Select next block too', icon: 'lu:arrow-down-to-line' },
          { id: 'previous', label: 'Select previous block too', icon: 'lu:arrow-up-to-line' },
          { id: 'all', label: 'Select all blocks', icon: 'lu:layers' },
        ] as const
      ).map((item) => ({
        ...item,
        disabled: !selectBlocks(item.id)(view.state),
        onSelect: () => {
          if (view.isDestroyed) return
          selectBlocks(item.id)(view.state, view.dispatch)
          view.focus()
        },
      })),
    ],
    { title: (selectedBlocks(view.state)?.count ?? 1) > 1 ? `${selectedBlocks(view.state)?.count} selected blocks` : 'Current block', x, y },
  )
}

function openTransformMenu(view: EditorView, x: number, y: number): void {
  if (view.isDestroyed) return
  actionMenu.open(
    [
      ...BLOCK_TRANSFORMS.map((item) => ({
        ...item,
        disabled: !transformBlocks(item.id)(view.state),
        onSelect: () => {
          if (view.isDestroyed) return
          transformBlocks(item.id)(view.state, view.dispatch)
          view.focus()
        },
      })),
      {
        id: 'columns',
        label: 'Columns',
        icon: 'lu:columns-2',
        disabled: !arrangeColumns(2)(view.state),
        onSelect: () => {
          if (!view.isDestroyed) {
            arrangeColumns(2)(view.state, view.dispatch)
            view.focus()
          }
        },
      },
    ],
    { title: 'Turn into', x, y },
  )
}
