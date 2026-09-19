import { validation } from '@arxhub/errors'
import type { ArxEditorContribution } from '@arxhub/plugin-editor'
import { embedRange, validateEmbedPath } from './embed-model'
import SheetEmbed from './ui/SheetEmbed.vue'

export const sheetContribution: ArxEditorContribution = {
  id: 'arxhub.sheets.embed',
  version: 1,
  nodes: {
    spreadsheet_embed: {
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      attrs: {
        path: { default: '', validate: validateEmbedPath },
        sheet: {
          default: '',
          validate: (value) => {
            if (typeof value !== 'string' || value.length > 31) throw validation('Invalid worksheet name')
          },
        },
        range: {
          default: 'A1:D8',
          validate: (value) => {
            embedRange(value)
          },
        },
      },
      toDOM: (node) => [
        'div',
        { 'data-type': 'spreadsheet_embed', 'data-path': node.attrs.path, 'data-sheet': node.attrs.sheet, 'data-range': node.attrs.range },
        `Spreadsheet: ${node.attrs.path} ${node.attrs.range}`,
      ],
      parseDOM: [
        {
          tag: 'div[data-type="spreadsheet_embed"]',
          getAttrs: (element) => ({
            path: element.getAttribute('data-path') ?? '',
            sheet: element.getAttribute('data-sheet') ?? '',
            range: element.getAttribute('data-range') ?? 'A1:D8',
          }),
        },
      ],
    },
  },
  components: { spreadsheet_embed: { component: SheetEmbed } },
  commands: (schema) => [
    {
      id: 'spreadsheet-embed',
      label: 'Spreadsheet',
      icon: 'lu:table-2',
      keywords: 'excel sheet таблица формулы',
      run: (state, dispatch) => {
        if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.spreadsheet_embed.create()).scrollIntoView())
        return true
      },
    },
  ],
}
