import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub } from '@arxhub/core'
import { PanelsPlugin, PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { ShellPlugin, ShellExtension } from '@arxhub/plugin-shell/ui'
import { ExplorerExtension, ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { TauriFileSystem, BaseDirectory } from '@arxhub/vfs-tauri'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
const vfs = new TauriFileSystem('', BaseDirectory.Home, arxhub.logger)
arxhub.plugins.register(VfsPlugin, () => ({ vfs }))
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
arxhub.plugins.register(ExplorerPlugin, () => ({ root: '' }))
arxhub.plugins.register(CodeMirrorPlugin)
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
