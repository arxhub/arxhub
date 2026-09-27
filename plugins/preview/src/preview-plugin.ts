import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { DocumentsExtension } from '@arxhub/plugin-documents'
import { PanelStoreExtension } from '@arxhub/plugin-panels'
import { SearchExtension } from '@arxhub/plugin-search'
import { markRaw } from 'vue'
import { t } from './i18n/messages'
import { manifest } from './manifest'
import { extensionsOf, MEDIA_KINDS, type MediaKind } from './media'
import { pdfExtractor } from './pdf-extract'
import MediaPanel from './ui/MediaPanel.vue'
import PdfPanel from './ui/PdfPanel.vue'

export const PREVIEW_PANEL_ID = 'arxhub.preview'
export const PDF_PANEL_ID = 'arxhub.preview.pdf'

const TITLES = { image: 'viewer.image', audio: 'viewer.audio', video: 'viewer.video' } as const satisfies Record<MediaKind, string>

// One component, three viewers: what differs between a photo and a recording is the element the
// panel puts on the stage, and the panel decides that from the path. Three registrations rather than
// one with every extension, so the registry — and whoever reads it — can say "an Image viewer" instead
// of "the media viewer".
export class PreviewPlugin extends Plugin {
  private unregisterExtractor: (() => void) | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    // Same pair as the other viewers: the panel definition is what still mounts a viewer while the
    // frames open through the panel store, the viewer registration is what claims the extensions.
    // A document panel's definition title is only a seed — its tab shows the file's name — so it stays a
    // string; a function there would replace the name (`panelTitle`).
    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({ id: PREVIEW_PANEL_ID, title: t('viewer.preview'), component: markRaw(MediaPanel) })
    // A second panel definition rather than a `kind` on the same one: a PDF is pages on a stage, not an
    // element `mediaOf` can name, and the panel store maps one definition to one component.
    store.registerPanel({ id: PDF_PANEL_ID, title: t('viewer.pdf'), component: markRaw(PdfPanel) })

    const documents = ctx.extensions.get(DocumentsExtension)
    for (const kind of MEDIA_KINDS) {
      documents.registerViewer({
        id: `${PREVIEW_PANEL_ID}.${kind}`,
        panelId: PREVIEW_PANEL_ID,
        title: () => t(TITLES[kind]),
        extensions: extensionsOf(kind),
        component: MediaPanel,
        // Ahead of the text viewer, which claims nothing here today; stated so a viewer that arrives
        // later with a broader list does not silently take a `.png` away.
        order: 5,
      })
    }

    documents.registerViewer({
      id: PDF_PANEL_ID,
      panelId: PDF_PANEL_ID,
      title: () => t('viewer.pdf'),
      extensions: ['.pdf'],
      component: PdfPanel,
      readMode: 'range',
      order: 5,
    })

    // Search is optional; without it there is no index to feed, and the viewer works the same.
    if (ctx.extensions.has(SearchExtension)) this.unregisterExtractor = ctx.extensions.get(SearchExtension).registerExtractor(pdfExtractor)
  }

  override stop(ctx: PluginContext): Promise<void> {
    this.unregisterExtractor?.()
    this.unregisterExtractor = null
    return super.stop(ctx)
  }
}
