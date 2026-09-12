import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ArxEditorExtension } from '@arxhub/plugin-editor/ui'
import { ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { sheetContribution } from './embed'
import { emptySheet } from './model'
import SheetEditor from './ui/SheetEditor.vue'

export class SheetsPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(
      args,
      definePluginManifest({ name: 'ArxSheets', version: '0.1.0', author: 'arxhub', description: 'Spreadsheets with offline formulas' }),
    )
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    if (ctx.extensions.has(ArxEditorExtension)) ctx.extensions.get(ArxEditorExtension).register(sheetContribution)
    const id = 'arxhub.sheets'
    ctx.extensions.get(NotesExtension).registerViewer({ id, panelId: id, title: 'Spreadsheet', extensions: ['.arxs'], component: SheetEditor })
    ctx.extensions.get(PanelStoreExtension).store.registerPanel({ id, title: 'Spreadsheet', component: SheetEditor })
    if (ctx.extensions.has(ExplorerExtension)) {
      ctx.extensions.get(ExplorerExtension).registerFileTemplate({
        extension: '.arxs',
        label: 'New spreadsheet',
        icon: 'lu:table-2',
        seed: () => JSON.stringify(emptySheet()),
      })
    }
  }
}
