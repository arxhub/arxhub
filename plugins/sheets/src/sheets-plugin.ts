import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ArxEditorExtension } from '@arxhub/plugin-editor/ui'
import { ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { RepositoryExtension } from '@arxhub/plugin-repository/ui'
import { sheetContribution } from './embed'
import { emptySheet } from './model'
import SheetEditor from './ui/SheetEditor.vue'
import { parseWorkbook, serializeWorkbook } from './workbook'
import { mergeWorkbooks } from './workbook-merge'

export class SheetsPlugin extends Plugin {
  private unregisterMerger: (() => void) | null = null

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
    // The plugin that owns the format owns its conflicts (Repository is essential — no has() guard). A
    // file either side cannot parse is declined, not thrown: a corrupt workbook is a state of the file,
    // not a bug in the merger, and the conflict copy it degrades to keeps both versions readable.
    this.unregisterMerger = ctx.extensions.get(RepositoryExtension).registerContentMerger({
      id: 'sheets',
      matches: (path) => path.toLowerCase().endsWith('.arxs'),
      merge: async (path, base, local, remote) => {
        const decoder = new TextDecoder()
        try {
          const { merged, conflicts } = mergeWorkbooks(
            base ? parseWorkbook(decoder.decode(base)) : null,
            parseWorkbook(decoder.decode(local)),
            parseWorkbook(decoder.decode(remote)),
          )
          // Refused here rather than discovered by the editor: a merge that lands a file the editor cannot
          // open (a log that overflowed a limit) is worse than a conflict copy.
          const text = serializeWorkbook(merged)
          parseWorkbook(text)
          return { merged: new TextEncoder().encode(text), conflicts }
        } catch (error) {
          this.logger.warn(`[sheets] could not merge ${path} cell by cell; leaving it to a conflict copy:`, error)
          return null
        }
      },
    })
  }

  override stop(ctx: PluginContext): Promise<void> {
    this.unregisterMerger?.()
    this.unregisterMerger = null
    return super.stop(ctx)
  }
}
