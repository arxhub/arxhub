import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { NotesExtension, type NoteViewer } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { manifest } from './manifest'
import CodeMirrorEditor from './ui/CodeMirrorEditor.vue'

export const CODEMIRROR_HANDLES = [
  '.txt',
  '.md',
  '.markdown',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.jsx',
  '.tsx',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.xml',
  '.svg',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.sql',
  '.ini',
  '.env',
  '.log',
  '.csv',
  '.lock',
]

// An editor is a way to show an object, not a place of its own — so what it can show is declared as a
// viewer of the "Notes" type, and picking one by extension stops being the panel layout's business.
//
// One viewer for markdown and code alike, where the reference model splits them in two: the split
// exists there to give a note a formatting bar and a `.tsx` none, and here that bar already lives
// inside the editor component, keyed off the path. Splitting now would buy a distinction nothing
// renders — the `dock` role has no consumer until a frame reads the type registry (F-14/F-16).
export const CODEMIRROR_VIEWER: NoteViewer = {
  // The same id as the panel definition below, for as long as both exist: the explorer still opens
  // through the store, and two ids for one editor would make the two registrations disagree.
  id: 'arxhub.codemirror.editor',
  title: 'Text',
  extensions: CODEMIRROR_HANDLES,
  component: CodeMirrorEditor,
  // Behind the document editor, so a format that has a richer viewer is not claimed by the plain one.
  order: 10,
}

export class CodeMirrorPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    // Both registrations stand side by side on purpose, and not for long. The panel definition is what
    // the frames read today; the viewer registry is what they read once F-14/F-16 wire them, and the
    // second half of F-21 then moves the explorer's lookup off `getPanelsForFile`. Dropping either one
    // before that takes this editor off the screen.
    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: CODEMIRROR_VIEWER.id,
      title: 'Editor',
      component: CodeMirrorEditor,
      handles: CODEMIRROR_HANDLES,
    })

    ctx.extensions.get(NotesExtension).registerViewer(CODEMIRROR_VIEWER)
  }
}
