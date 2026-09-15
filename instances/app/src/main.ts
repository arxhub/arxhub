import '@arxhub/theme-preset'
// Every theme the instance offers ships loaded and scoped to its own attribute; ThemePlugin flips
// the attribute. Adding a theme here is what makes it selectable.
import '@arxhub/theme'
import '@arxhub/theme-slate'
import '@arxhub/theme-catppuccin'

import { ArxHub, apiBaseUrl } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror/ui'
import { ConfigPlugin } from '@arxhub/plugin-config/ui'
import { ArxEditorPlugin } from '@arxhub/plugin-editor/ui'
import { ExplorerPlugin } from '@arxhub/plugin-explorer/ui'
import { HotkeysPlugin } from '@arxhub/plugin-hotkeys/ui'
import { KeyStorePlugin, resolveKeyStore } from '@arxhub/plugin-keystore/ui'
import { LoggerPlugin } from '@arxhub/plugin-logger/ui'
import { BootPolicy, MaintenancePlugin, startWithCrashScreen } from '@arxhub/plugin-maintenance/ui'
import { NOTES_TYPE_ID, NotesPlugin } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension, PanelsPlugin, restoreNavigationWorkspace, StorePanelHost } from '@arxhub/plugin-panels/ui'
import { PreviewPlugin } from '@arxhub/plugin-preview/ui'
import { loadOrCreateKeyring, ProtectionPlugin } from '@arxhub/plugin-protection/ui'
import { PublishPlugin } from '@arxhub/plugin-publish/ui'
import { RepositoryPlugin } from '@arxhub/plugin-repository/ui'
import { SearchPlugin } from '@arxhub/plugin-search/ui'
import { SettingsExtension, SettingsPlugin } from '@arxhub/plugin-settings/ui'
import { SheetsPlugin } from '@arxhub/plugin-sheets/ui'
import { AboutSettingsPage, ObjectGonePage, ShellExtension, ShellPlugin, Workspace, WorkspaceStorage } from '@arxhub/plugin-shell/ui'
import { SyncPlugin } from '@arxhub/plugin-sync/ui'
import { type Theme, ThemePlugin } from '@arxhub/plugin-theme/ui'
import { VfsPlugin } from '@arxhub/plugin-vfs/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { isTauri } from '@tauri-apps/api/core'
import { createApp, h, markRaw } from 'vue'
import WelcomePanel from './panels/WelcomePanel.vue'
import VaultSettingsPage from './settings/VaultSettingsPage.vue'

// Read before anything else: a plugin the owner switched off (or a maintenance boot) must not get as
// far as being constructed. The policy is device-local storage on purpose — see BootPolicy.
const policy = new BootPolicy()
const arxhub = new ArxHub({ disabled: policy.disabled, maintenance: policy.maintenance })
// Resolve the device identity from client-local storage and install it into the signer before start().
// In browser mode this signs every /vfs request; under Tauri the native fs needs no signing, but the
// same identity still drives sync encryption/auth.
// Blocks on the unlock prompt when the device is locked, or on first-run lock setup when it never has
// been (requireLock: true — a shipped build never boots with its secrets in the clear).
const keystore = await resolveKeyStore({ requireLock: true })
const keyring = await loadOrCreateKeyring(keystore)
const signer = new MutableRequestSigner()
signer.install(keyring)

async function createVfs(): Promise<VirtualFileSystem> {
  if (isTauri()) {
    const { TauriFileSystem, BaseDirectory, relocateLegacyStore } = await import('@arxhub/vfs-tauri')
    const { platform } = await import('@tauri-apps/plugin-os')
    // Mobile platforms have no home directory in the desktop sense — the vault belongs to the app's
    // own data directory there. The tree layout underneath is identical, or the two devices would
    // sync into different shapes.
    const mobile = platform() === 'android' || platform() === 'ios'
    if (mobile) return new TauriFileSystem('', BaseDirectory.AppData, arxhub.logger)
    // 0.1.6 stored the vault in `~/.arxhub`; a failed move must not keep the app from booting — it
    // comes up on a fresh store and the log says why the old one was left where it was.
    await relocateLegacyStore('.arxhub', 'ArxHub', BaseDirectory.Home, arxhub.logger).catch((error) =>
      arxhub.logger.error('Could not move the store from ~/.arxhub to ~/ArxHub', error),
    )
    return new TauriFileSystem('ArxHub', BaseDirectory.Home, arxhub.logger)
  }
  const { HttpFileSystem, VFS_NAMESPACE } = await import('@arxhub/vfs-http')
  return new HttpFileSystem({ baseUrl: apiBaseUrl('', VFS_NAMESPACE), signer }, arxhub.logger)
}

const vfs = await createVfs()
arxhub.plugins.register(VfsPlugin, () => ({ fs: vfs }))
arxhub.plugins.register(LoggerPlugin)
arxhub.plugins.register(ConfigPlugin)
// The owner of the keyboard: one window listener and the layer stack every chord resolves through.
// Essential, so no boot can reach a state where the shell advertises a chord that nothing answers —
// and not registered on the headless server, which has no DOM to listen on.
arxhub.plugins.register(HotkeysPlugin)
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
// The "Notes" type owns the vault objects and the registry of what opens them; the explorer below
// contributes the navigation into it. Essential, because there is no `dependsOn`: a boot with one of
// the two switched off is a state nobody has designed.
arxhub.plugins.register(NotesPlugin, () => ({ root: '' }))
arxhub.plugins.register(ExplorerPlugin, () => ({ root: '' }))
arxhub.plugins.register(CodeMirrorPlugin)
arxhub.plugins.register(PreviewPlugin)
arxhub.plugins.register(ArxEditorPlugin)
arxhub.plugins.register(SheetsPlugin)
arxhub.plugins.register(SettingsPlugin)
// The index is device-local and lives in the browser's own storage — never in the content store, so
// sync never walks it (FR-214). A headless server has no index at all (FR-218).
arxhub.plugins.register(SearchPlugin, () => ({ dataDir: 'idb://arxhub-sql' }))
const themes: Theme[] = [
  { id: 'default', title: 'ArxHub Light', base: 'light' },
  { id: 'default-dark', title: 'ArxHub Dark', base: 'dark' },
  { id: 'slate', title: 'ArxHub Slate', base: 'light' },
  { id: 'slate-dark', title: 'ArxHub Slate Dark', base: 'dark' },
  { id: 'catppuccin-latte', title: 'Catppuccin Latte', base: 'light' },
  { id: 'catppuccin-frappe', title: 'Catppuccin Frappé', base: 'dark' },
  { id: 'catppuccin-macchiato', title: 'Catppuccin Macchiato', base: 'dark' },
  { id: 'catppuccin-mocha', title: 'Catppuccin Mocha', base: 'dark' },
]
arxhub.plugins.register(ThemePlugin, () => ({ themes }))
arxhub.plugins.register(KeyStorePlugin, () => ({ keystore }))
arxhub.plugins.register(ProtectionPlugin, () => ({ keyring }))
arxhub.plugins.register(MaintenancePlugin, () => ({ policy }))
// The local repository (manifest chain, chunk store, checkout index, file history) is essential —
// version history and pending-file nodes must not go dark when sync (the optional remote exchange
// layered over it) is switched off (A-50). Registered right before it for the same reason.
arxhub.plugins.register(RepositoryPlugin)
arxhub.plugins.register(SyncPlugin)
arxhub.plugins.register(PublishPlugin)
// A failed boot lands on the crash screen instead of a blank page: it names the plugin that broke and
// offers to switch it off (or to boot the essentials only) and try again. When every failure happened
// in start(), carrying on is still an option — configure() had already registered the whole UI.
await startWithCrashScreen(arxhub, policy)

// The instance is what knows which build this is, so it contributes About rather than a plugin —
// otherwise the shell would have to depend on settings, which already depends on the shell.
arxhub.extensions.get(SettingsExtension).register({
  id: 'about',
  title: 'About',
  order: 900,
  component: markRaw({ render: () => h(AboutSettingsPage, { version: __APP_VERSION__ }) }),
})
arxhub.extensions.get(SettingsExtension).register({
  id: 'vault',
  title: 'Vault',
  order: 20,
  component: markRaw(VaultSettingsPage),
})

const shell = arxhub.extensions.get(ShellExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
// dedupe: a workspace restored from a previous session may already have Welcome open — without this,
// every boot added a second one on top of it rather than bringing the existing tab to front.
store.openPanel('arxhub.welcome', {}, 'Welcome', undefined, () => true)

// The desk of the navigation model, assembled here because only a composition root may hold both
// halves: the workspace needs a panel host per type, and the shell must not import the panels plugin
// to get one. A store per type — a type is the level ABOVE panel groups, and a group stays what it
// was, a cell of the layout.
//
// `desk` is referenced before the line that creates it, and only ever called after: constructing a
// workspace announces nothing. It is the shorter half of a loop — the storage saves this workspace,
// the workspace tells the storage what the person did.
const workspace = new Workspace({
  types: shell.types,
  goneView: markRaw(ObjectGonePage),
  // Notes owns documents; the same host also carries Welcome and the SQL console.
  createPanels: () => new StorePanelHost(store),
  emit: (event, payload) => desk.observe(event, payload),
})
const desk = new WorkspaceStorage({ workspace })
// Restored after every plugin has declared its types and before anything is on screen. Silently — a
// restore is the initial state, not news. It also has no right to keep a person out of the
// application: it reads storage, storage can be unavailable, and an unhandled rejection here would
// fail BEFORE app.mount() and leave a blank white page instead of a shell.
//
shell.attachWorkspace(workspace, desk)
await restoreNavigationWorkspace(arxhub.extensions.get(PanelStoreExtension), workspace, desk, NOTES_TYPE_ID)

// The frame is a build decision, not a runtime one: a phone package mounts the mobile shell and never
// ships the desktop one. __ARXHUB_FRAME__ comes from TAURI_ENV_PLATFORM — see vite.config.ts.
const Shell =
  __ARXHUB_FRAME__ === 'mobile'
    ? (await import('@arxhub/plugin-shell/ui-mobile')).MobileShell
    : (await import('@arxhub/plugin-shell/ui-desktop')).DesktopShell

const app = createApp(Shell)
app.provide(ARXHUB_KEY, arxhub)
app.mount('#app')
