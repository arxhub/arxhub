import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub, RootVfs } from '@arxhub/core'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { EditorPlugin } from '@arxhub/plugin-editor/ui'
import { ExplorerExtension, ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { PanelStoreExtension, PanelsPlugin } from '@arxhub/plugin-panels/ui'
import { SettingsPlugin } from '@arxhub/plugin-settings/ui'
import { ShellExtension, ShellPlugin } from '@arxhub/plugin-shell/ui'
import { SyncPlugin } from '@arxhub/plugin-sync/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { isTauri } from '@tauri-apps/api/core'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()

async function createVfs(): Promise<VirtualFileSystem> {
  if (isTauri()) {
    const { TauriFileSystem, BaseDirectory } = await import('@arxhub/vfs-tauri')
    return new TauriFileSystem('.arxhub', BaseDirectory.Home, arxhub.logger)
  }
  const { HttpFileSystem } = await import('@arxhub/vfs-http')
  return new HttpFileSystem({ baseUrl: '/vfs' }, arxhub.logger)
}

const vfs = await createVfs()
arxhub.services.register(RootVfs, () => [vfs])
arxhub.plugins.register(VfsPlugin)
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
arxhub.plugins.register(ExplorerPlugin, () => ({ root: '' }))
arxhub.plugins.register(CodeMirrorPlugin)
arxhub.plugins.register(EditorPlugin)
arxhub.plugins.register(SettingsPlugin)
arxhub.plugins.register(SyncPlugin)
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
