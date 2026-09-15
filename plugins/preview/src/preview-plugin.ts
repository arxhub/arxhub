import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { extensionsOf, MEDIA_KINDS, type MediaKind } from './media'
import MediaPanel from './ui/MediaPanel.vue'
import PdfPanel from './ui/PdfPanel.vue'

export const PREVIEW_PANEL_ID = 'arxhub.preview'
export const PDF_PANEL_ID = 'arxhub.preview.pdf'

const TITLES: Record<MediaKind, string> = { image: 'Image', audio: 'Audio', video: 'Video' }

// One component, three viewers: what differs between a photo and a recording is the element the
// panel puts on the stage, and the panel decides that from the path. Three registrations rather than
// one with every extension, so the registry — and whoever reads it — can say "an Image viewer" instead
// of "the media viewer".
export class PreviewPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    // Same pair as the other viewers: the panel definition is what still mounts a viewer while the
    // frames open through the panel store, the viewer registration is what claims the extensions.
    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({ id: PREVIEW_PANEL_ID, title: 'Preview', component: markRaw(MediaPanel) })
    // A second panel definition rather than a `kind` on the same one: a PDF is pages on a stage, not an
    // element `mediaOf` can name, and the panel store maps one definition to one component.
    store.registerPanel({ id: PDF_PANEL_ID, title: 'PDF', component: markRaw(PdfPanel) })

    const notes = ctx.extensions.get(NotesExtension)
    for (const kind of MEDIA_KINDS) {
      notes.registerViewer({
        id: `${PREVIEW_PANEL_ID}.${kind}`,
        panelId: PREVIEW_PANEL_ID,
        title: TITLES[kind],
        extensions: extensionsOf(kind),
        component: MediaPanel,
        // Ahead of the text viewer, which claims nothing here today; stated so a viewer that arrives
        // later with a broader list does not silently take a `.png` away.
        order: 5,
      })
    }

    notes.registerViewer({
      id: PDF_PANEL_ID,
      panelId: PDF_PANEL_ID,
      title: 'PDF',
      extensions: ['.pdf'],
      component: PdfPanel,
      order: 5,
    })
  }
}
