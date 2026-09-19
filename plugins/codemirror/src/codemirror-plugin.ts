import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { HotkeysExtension } from '@arxhub/plugin-hotkeys'
import { NotesExtension, type NoteViewer } from '@arxhub/plugin-notes'
import { PanelStoreExtension } from '@arxhub/plugin-panels'
import { declareCodeMirrorChords } from './hotkeys'
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

const CODEMIRROR_PANEL_ID = 'arxhub.codemirror.editor'

// An editor is a way to show an object, not a place of its own — so what it can show is declared as a
// viewer of the "Notes" type, and picking one by extension stops being the panel layout's business.
//
// One viewer for markdown and code alike, where the reference model splits them in two: the split
// exists there to give a note a formatting bar and a `.tsx` none, and here that bar already lives
// inside the editor component, keyed off the path. Splitting now would buy a distinction nothing
// renders — the `dock` role has no consumer until a frame reads the type registry (F-14/F-16).
export const CODEMIRROR_VIEWER: NoteViewer = {
  id: CODEMIRROR_PANEL_ID,
  // The panel this viewer opens through while the frames still open through the panel store. Stated
  // rather than derived from `id`: the two strings are equal today, and a lookup that relied on that
  // would break silently the day one of them changed.
  panelId: CODEMIRROR_PANEL_ID,
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

    // Both registrations stand side by side on purpose, and not for long. The viewer registry is what
    // decides WHICH editor opens a file; the panel definition is still what mounts it, and stays until
    // the frames read the type registry (F-14/F-16). Dropping it before that takes this editor off the
    // screen.
    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: CODEMIRROR_VIEWER.panelId,
      title: 'Editor',
      component: CodeMirrorEditor,
    })

    ctx.extensions.get(NotesExtension).registerViewer(CODEMIRROR_VIEWER)

    // Beside the viewer, and for the same reason: both say what this editor IS, independently of
    // whether a panel showing one is open.
    declareCodeMirrorChords(ctx.extensions.get(HotkeysExtension))
  }
}
