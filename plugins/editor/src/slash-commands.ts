import { chainCommands, setBlockType, wrapIn } from 'prosemirror-commands'
import { closeHistory } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { wrapInList } from 'prosemirror-schema-list'
import { type Command, type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import { schema as defaultSchema } from './editor-schema'

export interface BlockCommand {
  id: string
  label: string
  icon: string
  keywords: string
  run: Command
}

const insertLeaf =
  (type: string): Command =>
  (state, dispatch) => {
    const { schema } = state
    const { $from } = state.selection
    if ($from.parent.type !== schema.nodes.paragraph || $from.parent.content.size !== 0) return false
    if (dispatch) {
      const from = $from.before()
      const tr = state.tr.replaceWith(from, $from.after(), [schema.nodes[type].create(), schema.nodes.paragraph.create()])
      dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2)).scrollIntoView())
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
    { id: 'divider', label: 'Divider', icon: 'lu:minus', keywords: 'hr разделитель', run: insertLeaf('horizontal_rule') },
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

export function runSlashCommand(state: EditorState, dispatch: (tr: Transaction) => void, command: BlockCommand): boolean {
  const menu = slashKey.getState(state)
  if (!menu || editorMode(state) !== 'editable') return false
  const tr = state.tr.delete(menu.from, menu.to)
  if (!runPreparedCommand(state, tr, command.run)) return false
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
          return command ? runSlashCommand(view.state, view.dispatch, command) : false
        }
        return false
      },
    },
  })
}
