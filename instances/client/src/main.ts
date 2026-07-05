import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { ConfigPlugin } from '@arxhub/plugin-config/ui'
import { EditorPlugin } from '@arxhub/plugin-editor/ui'
import { ExplorerExtension, ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { KeyStorePlugin, LocalStorageKeyStore } from '@arxhub/plugin-keystore/ui'
import { LoggerPlugin } from '@arxhub/plugin-logger/ui'
import { PanelStoreExtension, PanelsPlugin } from '@arxhub/plugin-panels/ui'
import { loadOrCreateKeyring, ProtectionPlugin } from '@arxhub/plugin-protection/ui'
import { SettingsPlugin } from '@arxhub/plugin-settings/ui'
import { ShellExtension, ShellPlugin } from '@arxhub/plugin-shell/ui'
import { SyncPlugin } from '@arxhub/plugin-sync/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { HttpFileSystem } from '@arxhub/vfs-http'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
// Resolve the device identity from client-local storage (never the server VFS) and install it into the
// signer BEFORE start(): the /vfs backend is protected, so every request must already be signed.
const keystore = new LocalStorageKeyStore()
const keyring = await loadOrCreateKeyring(keystore)
const signer = new MutableRequestSigner()
signer.install(keyring)
const vfs = new HttpFileSystem({ baseUrl: '/api/vfs', signer }, arxhub.logger)

arxhub.plugins.register(VfsPlugin, () => ({ fs: vfs }))
arxhub.plugins.register(LoggerPlugin)
arxhub.plugins.register(ConfigPlugin)
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
arxhub.plugins.register(ExplorerPlugin, () => ({ root: '' }))
arxhub.plugins.register(CodeMirrorPlugin)
arxhub.plugins.register(EditorPlugin)
arxhub.plugins.register(SettingsPlugin)
arxhub.plugins.register(KeyStorePlugin, () => ({ keystore }))
arxhub.plugins.register(ProtectionPlugin, () => ({ keyring }))
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
