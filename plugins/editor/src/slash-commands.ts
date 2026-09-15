import { chainCommands, setBlockType, wrapIn } from 'prosemirror-commands'
import { closeHistory } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { wrapInList } from 'prosemirror-schema-list'
import { type Command, type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state'
import { arrangeColumns } from './columns'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import { schema as defaultSchema } from './editor-schema'
import { insertTable } from './table-actions'

export interface BlockCommand {
  id: string
  label: string
  icon: string
  keywords: string
  run: Command
}

// The trigger paragraph is replaced only while it is empty; one that still has text (a `/` typed at
// the start of a line the user meant to keep) stays, and the block lands after it — the same shape the
// `+` handle produces (`insertBlock` in block-actions.ts). A fresh paragraph follows either way, so the
// caret has a textblock to land in after an atom.
const insertLeaf =
  (type: string): Command =>
  (state, dispatch) => {
    const { schema } = state
    const { $from, empty } = state.selection
    const leaf = schema.nodes[type]?.createAndFill()
    if (!empty || !leaf || $from.parent.type !== schema.nodes.paragraph) return false
    if (dispatch) {
      const tr = state.tr
      const replace = $from.parent.content.size === 0
      const from = replace ? $from.before() : $from.after()
      tr.replaceWith(from, replace ? $from.after() : from, [leaf, schema.nodes.paragraph.create()])
      dispatch(tr.setSelection(TextSelection.create(tr.doc, from + leaf.nodeSize + 1)).scrollIntoView())
    }
    return true
  }

export function buildBlockCommands(schema: Schema): BlockCommand[] {
  return [
    {
      id: 'paragraph',
      label: 'Paragraph',
      icon: 'lu:pilcrow',
      keywords: 'text текст абзац',
      run: chainCommands(setBlockType(schema.nodes.paragraph), (state) => state.selection.$from.parent.type === schema.nodes.paragraph),
    },
    ...[1, 2, 3].map((level) => ({
      id: `heading-${level}`,
      label: `Heading ${level}`,
      icon: `lu:heading-${level}`,
      keywords: `h${level} заголовок`,
      run: setBlockType(schema.nodes.heading, { level }),
    })),
    { id: 'bullet-list', label: 'Bulleted list', icon: 'lu:list', keywords: 'ul список', run: wrapInList(schema.nodes.bullet_list) },
    { id: 'ordered-list', label: 'Numbered list', icon: 'lu:list-ordered', keywords: 'ol список', run: wrapInList(schema.nodes.ordered_list) },
    {
      id: 'task-list',
      label: 'Task list',
      icon: 'lu:list-checks',
      keywords: 'todo checkbox задачи галочка',
      run: wrapInList(schema.nodes.task_list),
    },
    { id: 'quote', label: 'Quote', icon: 'lu:quote', keywords: 'blockquote цитата', run: wrapIn(schema.nodes.blockquote) },
    { id: 'callout', label: 'Callout', icon: 'lu:info', keywords: 'info выноска', run: wrapIn(schema.nodes.callout) },
    { id: 'code', label: 'Code block', icon: 'lu:code', keywords: 'код', run: setBlockType(schema.nodes.code_block) },
    {
      id: 'section',
      label: 'Collapsible section',
      icon: 'lu:chevrons-up-down',
      keywords: 'toggle details fold секция свернуть',
      run: wrapIn(schema.nodes.section),
    },
    { id: 'columns-2', label: 'Two columns', icon: 'lu:columns-2', keywords: 'layout колонки', run: arrangeColumns(2) },
    { id: 'columns-3', label: 'Three columns', icon: 'lu:columns-3', keywords: 'layout колонки', run: arrangeColumns(3) },
    { id: 'table', label: 'Table', icon: 'lu:table', keywords: 'grid rows columns таблица', run: insertTable },
    { id: 'divider', label: 'Divider', icon: 'lu:minus', keywords: 'hr разделитель', run: insertLeaf('horizontal_rule') },
    {
      id: 'data-view',
      label: 'Data view',
      icon: 'lu:layout-list',
      keywords: 'query tasks board calendar данные задачи доска календарь',
      run: insertLeaf('data_view'),
    },
    { id: 'select', label: 'Dropdown', icon: 'lu:list-filter', keywords: 'select status список выбор статус', run: insertLeaf('select') },
    { id: 'image', label: 'Image', icon: 'lu:image', keywords: 'picture photo изображение фото', run: insertLeaf('image_block') },
    { id: 'attachment', label: 'File attachment', icon: 'lu:paperclip', keywords: 'upload file файл вложение', run: insertLeaf('attachment') },
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
  return commands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(needle))
}

function queryAtCursor(state: EditorState): Omit<SlashMenuState, 'index'> | null {
  const { $from, empty } = state.selection
  if (!empty || editorMode(state) !== 'editable' || $from.parent.type !== state.schema.nodes.paragraph) return null
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = /^\/([^\s/]*)$/.exec(text)
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
