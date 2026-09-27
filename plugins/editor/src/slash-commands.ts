import { readText, type Text } from '@arxhub/i18n'
import { chainCommands, setBlockType, wrapIn } from 'prosemirror-commands'
import { closeHistory } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { wrapInList } from 'prosemirror-schema-list'
import { type Command, type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state'
import { placeBlocks } from './block-placement'
import { arrangeColumns } from './columns'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import { schema as defaultSchema } from './editor-schema'
import { t } from './i18n/messages'
import { insertTable } from './table-actions'

export interface BlockCommand {
  id: string
  // Contributed once, in configure(): a function keeps the menu in the language shown now.
  label: Text
  icon: string
  keywords: string
  run: Command
}

// A fresh paragraph follows the leaf, so the caret has a textblock to land in after an atom. `attrs` is read at
// insertion, not when the menu is built: the words it writes into the file are in the language shown now.
const insertLeaf =
  (type: string, attrs?: () => Record<string, unknown>): Command =>
  (state, dispatch) => {
    const { schema } = state
    const { $from, empty } = state.selection
    const leaf = schema.nodes[type]?.createAndFill(attrs?.())
    if (!empty || !leaf || $from.parent.type !== schema.nodes.paragraph) return false
    const tr = state.tr
    const from = placeBlocks(tr, $from, [leaf, schema.nodes.paragraph.create()])
    if (from === null) return false
    if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, from + leaf.nodeSize + 1)).scrollIntoView())
    return true
  }

// The schema's own defaults stay English: they are what an old file without the attribute reads as.
export function defaultSelectAttrs(): Record<string, unknown> {
  return {
    label: t('select.defaultLabel'),
    options: [
      { id: 'not-started', label: t('select.defaultOptions.notStarted') },
      { id: 'in-progress', label: t('select.defaultOptions.inProgress') },
      { id: 'done', label: t('select.defaultOptions.done') },
    ],
  }
}

export function defaultSectionAttrs(): Record<string, unknown> {
  return { title: t('blocks.sectionDefaultTitle') }
}

export function buildBlockCommands(schema: Schema): BlockCommand[] {
  return [
    {
      id: 'paragraph',
      label: () => t('blocks.paragraph'),
      icon: 'lu:pilcrow',
      keywords: 'text текст абзац',
      run: chainCommands(setBlockType(schema.nodes.paragraph), (state) => state.selection.$from.parent.type === schema.nodes.paragraph),
    },
    ...[1, 2, 3].map((level) => ({
      id: `heading-${level}`,
      label: () => t(`blocks.heading${level as 1 | 2 | 3}`),
      icon: `lu:heading-${level}`,
      keywords: `h${level} заголовок`,
      run: setBlockType(schema.nodes.heading, { level }),
    })),
    {
      id: 'bullet-list',
      label: () => t('blocks.bulletList'),
      icon: 'lu:list',
      keywords: 'ul список',
      run: wrapInList(schema.nodes.bullet_list),
    },
    {
      id: 'ordered-list',
      label: () => t('blocks.orderedList'),
      icon: 'lu:list-ordered',
      keywords: 'ol список',
      run: wrapInList(schema.nodes.ordered_list),
    },
    {
      id: 'task-list',
      label: () => t('blocks.taskList'),
      icon: 'lu:list-checks',
      keywords: 'todo checkbox задачи галочка',
      run: wrapInList(schema.nodes.task_list),
    },
    { id: 'quote', label: () => t('blocks.quote'), icon: 'lu:quote', keywords: 'blockquote цитата', run: wrapIn(schema.nodes.blockquote) },
    { id: 'callout', label: () => t('blocks.callout'), icon: 'lu:info', keywords: 'info выноска', run: wrapIn(schema.nodes.callout) },
    { id: 'code', label: () => t('blocks.code'), icon: 'lu:code', keywords: 'код', run: setBlockType(schema.nodes.code_block) },
    {
      id: 'section',
      label: () => t('blocks.section'),
      icon: 'lu:chevrons-up-down',
      keywords: 'toggle details fold секция свернуть',
      run: (state, dispatch, view) => wrapIn(schema.nodes.section, defaultSectionAttrs())(state, dispatch, view),
    },
    { id: 'columns', label: () => t('blocks.columns'), icon: 'lu:columns-2', keywords: 'layout колонки', run: arrangeColumns(2) },
    { id: 'table', label: () => t('blocks.table'), icon: 'lu:table', keywords: 'grid rows columns таблица', run: insertTable },
    { id: 'divider', label: () => t('blocks.divider'), icon: 'lu:minus', keywords: 'hr разделитель', run: insertLeaf('horizontal_rule') },
    {
      id: 'data-view',
      label: () => t('blocks.collection'),
      icon: 'lu:layout-list',
      keywords: 'query tasks documents collection данные задачи документы подборка',
      run: insertLeaf('data_view'),
    },
    {
      id: 'select',
      label: () => t('blocks.dropdown'),
      icon: 'lu:list-filter',
      keywords: 'select status список выбор статус',
      run: insertLeaf('select', defaultSelectAttrs),
    },
    {
      id: 'image',
      label: () => t('blocks.image'),
      icon: 'lu:image',
      keywords: 'picture photo изображение фото',
      run: insertLeaf('image_block'),
    },
    {
      id: 'attachment',
      label: () => t('blocks.attachment'),
      icon: 'lu:paperclip',
      keywords: 'upload file файл вложение',
      run: insertLeaf('attachment'),
    },
  ]
}

export const BLOCK_COMMANDS = buildBlockCommands(defaultSchema)

export interface SlashMenuState {
  from: number
  to: number
  query: string
  index: number
}

export const slashKey = new PluginKey<SlashMenuState | null>('slash-commands')

export function matchingCommands(query: string, commands: readonly BlockCommand[] = BLOCK_COMMANDS): BlockCommand[] {
  const needle = query.toLowerCase()
  return commands.filter((command) => `${readText(command.label)} ${command.keywords}`.toLowerCase().includes(needle))
}

// A space is part of a name ("heading 2"), a second slash is a path (`path/to`) — the first keeps the
// menu open, the second closes it.
function queryAtCursor(state: EditorState): Omit<SlashMenuState, 'index'> | null {
  const { $from, empty } = state.selection
  if (!empty || editorMode(state) !== 'editable' || $from.parent.type !== state.schema.nodes.paragraph) return null
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = /^\/([^/]*)$/.exec(text)
  return match ? { from: $from.start(), to: $from.pos, query: match[1] } : null
}

// Whether a row can act is decided the same way running it is — trigger deleted first, command tried on
// what is left — so a menu never offers a block the Enter key would then refuse.
function prepareSlashCommand(state: EditorState, command: BlockCommand): Transaction | null {
  const menu = slashKey.getState(state)
  if (!menu || editorMode(state) !== 'editable') return null
  const tr = state.tr.delete(menu.from, menu.to)
  return runPreparedCommand(state, tr, command.run) ? tr : null
}

export function canRunSlashCommand(state: EditorState, command: BlockCommand): boolean {
  return prepareSlashCommand(state, command) !== null
}

export function runSlashCommand(state: EditorState, dispatch: (tr: Transaction) => void, command: BlockCommand): boolean {
  const tr = prepareSlashCommand(state, command)
  if (!tr) return false
  dispatch(closeHistory(tr).setMeta(slashKey, 'dismiss').scrollIntoView())
  return true
}

export function slashCommands(menuId = 'arx-slash-menu', commands: readonly BlockCommand[] = BLOCK_COMMANDS): Plugin<SlashMenuState | null> {
  return new Plugin<SlashMenuState | null>({
    key: slashKey,
    state: {
      init: () => null,
      apply: (tr, previous, _old, state) => {
        const action: unknown = tr.getMeta(slashKey)
        if (action === 'dismiss' || (!previous && !tr.docChanged)) return null
        const next = queryAtCursor(state)
        if (!next) return null
        const count = matchingCommands(next.query, commands).length
        // A query with a space in it that names nothing is a sentence that happens to start with `/`;
        // holding the menu open over it would hold the writer hostage. Without the space, "No matching
        // blocks" stays useful — a typo one Backspace away.
        if (!count && /\s/.test(next.query)) return null
        const index = typeof action === 'number' ? action : previous?.query === next.query ? previous.index : 0
        return { ...next, index: count ? (index + count) % count : 0 }
      },
    },
    props: {
      attributes: (state): Record<string, string> => {
        const menu = slashKey.getState(state)
        const command = menu && matchingCommands(menu.query, commands)[menu.index]
        return menu
          ? {
              'aria-controls': menuId,
              'aria-activedescendant': command ? `${menuId}-${command.id}` : '',
              'aria-autocomplete': 'list',
            }
          : {}
      },
      handleDOMEvents: {
        blur: (view, event) => {
          if (event.relatedTarget instanceof Element && event.relatedTarget.closest(`[id="${menuId}"]`)) return false
          if (slashKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(slashKey, 'dismiss'))
          return false
        },
      },
      handleKeyDown: (view, event) => {
        const menu = slashKey.getState(view.state)
        if (!menu || event.isComposing) return false
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(slashKey, 'dismiss'))
          return true
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          view.dispatch(view.state.tr.setMeta(slashKey, menu.index + (event.key === 'ArrowDown' ? 1 : -1)))
          return true
        }
        if (event.key === 'Enter') {
          const command = matchingCommands(menu.query, commands)[menu.index]
          if (!command) return false
          // A disabled row takes the key and does nothing, as a disabled menu item would; letting Enter
          // fall through would split the paragraph and leave the trigger in the text.
          runSlashCommand(view.state, view.dispatch, command)
          return true
        }
        return false
      },
    },
  })
}
