import { type ActionItem, actionMenu } from '@arxhub/uikit/core'
import { isInTable } from 'prosemirror-tables'
import type { EditorView } from 'prosemirror-view'
import { changeBlock, insertParagraphBeside } from '../block-actions'
import { continueAfterBlock } from '../block-navigation'
import { selectBlocks, selectedBlocks } from '../block-selection'
import { BLOCK_TRANSFORMS, transformBlocks } from '../block-transforms'
import { arrangeColumns } from '../columns'
import { buildKeymap } from '../editor-keymap'
import { t } from '../i18n/messages'
import { TABLE_ACTIONS } from '../table-actions'

export function openBlockMenu(view: EditorView, x: number, y: number): void {
  const items = [
    { id: 'up', label: t('blockMenu.up'), icon: 'lu:arrow-up' },
    { id: 'down', label: t('blockMenu.down'), icon: 'lu:arrow-down' },
    { id: 'duplicate', label: t('blockMenu.duplicate'), icon: 'lu:copy' },
    { id: 'delete', label: t('blockMenu.delete'), icon: 'lu:trash-2' },
  ] as const
  actionMenu.open(
    [
      ...[
        {
          id: 'paragraph-before',
          label: () => t('blockMenu.paragraphBefore'),
          icon: 'lu:arrow-up-to-line',
          run: insertParagraphBeside('before'),
        },
        {
          id: 'paragraph-after',
          label: () => t('blockMenu.paragraphAfter'),
          icon: 'lu:arrow-down-to-line',
          run: insertParagraphBeside('after'),
        },
        { id: 'continue', label: () => t('blockMenu.continue'), icon: 'lu:corner-down-right', run: continueAfterBlock },
        { id: 'indent', label: () => t('blockMenu.indent'), icon: 'lu:list-indent-increase', run: buildKeymap(view.state.schema).Tab },
        {
          id: 'outdent',
          label: () => t('blockMenu.outdent'),
          icon: 'lu:list-indent-decrease',
          run: buildKeymap(view.state.schema)['Shift-Tab'],
        },
        ...(isInTable(view.state) ? TABLE_ACTIONS.filter((action) => action.id !== 'header') : []),
      ].map((action) => ({
        id: action.id,
        label: action.label(),
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
          tone: item.id === 'delete' ? 'danger' : 'neutral',
          disabled: !changeBlock(item.id)(view.state),
          onSelect: () => {
            if (view.isDestroyed) return
            changeBlock(item.id)(view.state, view.dispatch)
            view.focus()
          },
        }),
      ),
      { id: 'transform', label: t('blockMenu.turnInto'), icon: 'lu:repeat-2', onSelect: () => openTransformMenu(view, x, y) },
      ...(
        [
          { id: 'current', label: t('blockMenu.selectCurrent'), icon: 'lu:square-dashed' },
          { id: 'parent', label: t('blockMenu.selectParent'), icon: 'lu:corner-left-up' },
          { id: 'next', label: t('blockMenu.selectNext'), icon: 'lu:arrow-down-to-line' },
          { id: 'previous', label: t('blockMenu.selectPrevious'), icon: 'lu:arrow-up-to-line' },
          { id: 'all', label: t('blockMenu.selectAll'), icon: 'lu:layers' },
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
    { title: selectionTitle(selectedBlocks(view.state)?.count ?? 1), x, y },
  )
}

function openTransformMenu(view: EditorView, x: number, y: number): void {
  if (view.isDestroyed) return
  actionMenu.open(
    [
      ...BLOCK_TRANSFORMS.map((item) => ({
        ...item,
        label: item.label(),
        disabled: !transformBlocks(item.id)(view.state),
        onSelect: () => {
          if (view.isDestroyed) return
          transformBlocks(item.id)(view.state, view.dispatch)
          view.focus()
        },
      })),
      {
        id: 'columns',
        label: t('blocks.columns'),
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
    { title: t('blockMenu.turnInto'), x, y },
  )
}

function selectionTitle(count: number): string {
  return count > 1 ? t('blockMenu.selected', { count }) : t('blockMenu.current')
}
