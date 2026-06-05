import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub } from '@arxhub/core'
import { PanelsPlugin, PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { ShellPlugin, ShellExtension } from '@arxhub/plugin-shell/ui'
import { ExplorerExtension, ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { EditorPlugin } from '@arxhub/plugin-editor/ui'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { isTauri } from '@tauri-apps/api/core'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()

// Tauri is just an OS bridge: use the native filesystem when running inside the
// desktop shell, otherwise talk to the ArxHub server over HTTP (browser mode).
// The Tauri impl is imported dynamically so its IPC code never loads in a browser.
async function createVfs(): Promise<VirtualFileSystem> {
  if (isTauri()) {
    const { TauriFileSystem, BaseDirectory } = await import('@arxhub/vfs-tauri')
    return new TauriFileSystem('.arxhub', BaseDirectory.Home, arxhub.logger)
  }
  const { HttpFileSystem } = await import('@arxhub/vfs-http')
  return new HttpFileSystem({ baseUrl: '/vfs' }, arxhub.logger)
}

const vfs = await createVfs()
arxhub.plugins.register(VfsPlugin, () => ({ vfs }))
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
arxhub.plugins.register(ExplorerPlugin, () => ({ root: '' }))
arxhub.plugins.register(CodeMirrorPlugin)
arxhub.plugins.register(EditorPlugin)
await arxhub.start()

const shell = arxhub.extensions.get(ShellExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

shell.sidebar.setActive('arxhub.explorer')

const explorer = arxhub.extensions.get(ExplorerExtension)

store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
store.openPanel('arxhub.welcome', {}, 'Welcome', explorer.contentGroupId ?? undefined)

const app = createApp(App)
app.provide(ARXHUB_KEY, arxhub)
app.mount('#app')
