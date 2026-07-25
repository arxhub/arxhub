import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub, apiBaseUrl } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { ConfigPlugin } from '@arxhub/plugin-config/ui'
import { EditorPlugin } from '@arxhub/plugin-editor/ui'
import { ExplorerExtension, ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { KeyStorePlugin, LocalStorageKeyStore } from '@arxhub/plugin-keystore/ui'
import { LoggerPlugin } from '@arxhub/plugin-logger/ui'
import { PanelStoreExtension, PanelsPlugin } from '@arxhub/plugin-panels/ui'
import { loadOrCreateKeyring, ProtectionPlugin } from '@arxhub/plugin-protection/ui'
import { PublishPlugin } from '@arxhub/plugin-publish/ui'
import { SettingsExtension, SettingsPlugin } from '@arxhub/plugin-settings/ui'
import { AboutSettingsPage, ShellExtension, ShellPlugin } from '@arxhub/plugin-shell/ui'
import { SyncPlugin } from '@arxhub/plugin-sync/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { HttpFileSystem, VFS_NAMESPACE } from '@arxhub/vfs-http'
import { createApp, h, markRaw } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
// Resolve the device identity from client-local storage (never the server VFS) and install it into the
// signer BEFORE start(): the working-tree /vfs is itself protected, so every request — including the
// logger's and each plugin's config reads during startup — must already be signed.
const keystore = new LocalStorageKeyStore()
const keyring = await loadOrCreateKeyring(keystore)
const signer = new MutableRequestSigner()
signer.install(keyring)
const vfs = new HttpFileSystem({ baseUrl: apiBaseUrl('', VFS_NAMESPACE), signer }, arxhub.logger)

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
arxhub.plugins.register(PublishPlugin)
// A plugin failing to start must not leave a blank page: configure() already registered every
// UI contribution, so the shell can still mount and the user can reach Settings to fix what broke
// (a phrase the server does not know, an unreachable host). Failures are logged per plugin.
await arxhub.start().catch((error) => arxhub.logger.error('Some plugins failed to start', error))

// The instance is what knows which build this is, so it contributes About rather than a plugin —
// otherwise the shell would have to depend on settings, which already depends on the shell.
arxhub.extensions.get(SettingsExtension).register({
  id: 'about',
  title: 'About',
  order: 900,
  component: markRaw({ render: () => h(AboutSettingsPage, { version: __APP_VERSION__ }) }),
})

const shell = arxhub.extensions.get(ShellExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

shell.sidebar.setActive('arxhub.explorer')

const explorer = arxhub.extensions.get(ExplorerExtension)

store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
store.openPanel('arxhub.welcome', {}, 'Welcome', explorer.contentGroupId ?? undefined)

const app = createApp(App)
app.provide(ARXHUB_KEY, arxhub)
app.mount('#app')
