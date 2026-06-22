import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
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

export class CodeMirrorPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: 'arxhub.codemirror.editor',
      title: 'Editor',
      component: CodeMirrorEditor,
      handles: CODEMIRROR_HANDLES,
    })
  }
}
