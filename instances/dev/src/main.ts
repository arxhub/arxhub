import '@arxhub/theme-preset'
// Every theme the instance offers ships loaded and scoped to its own attribute; ThemePlugin flips
// the attribute. Adding a theme here is what makes it selectable.
import '@arxhub/theme'
import '@arxhub/theme-slate'
import '@arxhub/theme-catppuccin'

import { bootClient, shellForFrame } from '@arxhub/boot/client'
import { apiBaseUrl } from '@arxhub/core'
import { AiWorkspacePlugin } from '@arxhub/plugin-ai-workspace'
import { BudgetPlugin } from '@arxhub/plugin-budget'
import { CodeMirrorPlugin } from '@arxhub/plugin-codemirror'
import { ConfigPlugin } from '@arxhub/plugin-config'
import { ArxEditorPlugin } from '@arxhub/plugin-editor'
import { ExplorerPlugin } from '@arxhub/plugin-explorer'
import { HotkeysPlugin } from '@arxhub/plugin-hotkeys'
import { KeyStorePlugin } from '@arxhub/plugin-keystore'
import { LoggerPlugin } from '@arxhub/plugin-logger'
import { MaintenancePlugin } from '@arxhub/plugin-maintenance'
import { NotesPlugin } from '@arxhub/plugin-notes'
import { PanelStoreExtension, PanelsPlugin } from '@arxhub/plugin-panels'
import { PreviewPlugin } from '@arxhub/plugin-preview'
import { ProtectionPlugin } from '@arxhub/plugin-protection'
import { PublishPlugin } from '@arxhub/plugin-publish'
import { RepositoryPlugin } from '@arxhub/plugin-repository'
import { SearchPlugin } from '@arxhub/plugin-search'
import { SettingsExtension, SettingsPlugin } from '@arxhub/plugin-settings'
import { SheetsPlugin } from '@arxhub/plugin-sheets'
import { ShellPlugin } from '@arxhub/plugin-shell'
import { AboutSettingsPage } from '@arxhub/plugin-shell/ui'
import { SyncPlugin } from '@arxhub/plugin-sync'
import { type Theme, ThemePlugin } from '@arxhub/plugin-theme'
import { VfsPlugin } from '@arxhub/plugin-vfs'
import { detectShellFrame } from '@arxhub/uikit/hooks'
import { HttpFileSystem, VFS_NAMESPACE } from '@arxhub/vfs-http'
import { h, markRaw } from 'vue'
import WelcomePanel from './panels/WelcomePanel.vue'

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

const frame = detectShellFrame()

await bootClient({
  version: __APP_VERSION__,
  frame,
  // The stand and the e2e suite seed a plaintext identity into storage before the app runs and must
  // come straight up with no interaction, so this one never demands the lock.
  requireLock: false,
  // One browser build is served to phones and desktops alike, so this bundle cannot know its frame and
  // probes once, here, at boot. Nothing below the shell measures the window again.
  loadShell: () => shellForFrame(frame),

  createVfs: ({ signer, logger }) => Promise.resolve(new HttpFileSystem({ baseUrl: apiBaseUrl('', VFS_NAMESPACE), signer }, logger)),

  register: (arxhub, { vfs, keystore, keyring, policy }) => {
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
    arxhub.plugins.register(ThemePlugin, () => ({ themes }))
    arxhub.plugins.register(KeyStorePlugin, () => ({ keystore }))
    arxhub.plugins.register(ProtectionPlugin, () => ({ keyring }))
    arxhub.plugins.register(MaintenancePlugin, () => ({ policy }))
    // The local repository (manifest chain, chunk store, checkout index, file history) is essential —
    // version history and pending-file nodes must not go dark when sync (the optional remote exchange
    // layered over it) is switched off (A-50). Registered right before it for the same reason.
    arxhub.plugins.register(RepositoryPlugin)
    arxhub.plugins.register(BudgetPlugin)
    arxhub.plugins.register(AiWorkspacePlugin)
    arxhub.plugins.register(SyncPlugin)
    arxhub.plugins.register(PublishPlugin)
  },

  contribute: (arxhub) => {
    // The instance is what knows which build this is, so it contributes About rather than a plugin —
    // otherwise the shell would have to depend on settings, which already depends on the shell.
    arxhub.extensions.get(SettingsExtension).register({
      id: 'about',
      title: 'About',
      icon: 'lu:info',
      order: 900,
      component: markRaw({ render: () => h(AboutSettingsPage, { version: __APP_VERSION__ }) }),
    })

    const { store } = arxhub.extensions.get(PanelStoreExtension)
    store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
    // dedupe: a workspace restored from a previous session may already have Welcome open — without this,
    // every boot added a second one on top of it rather than bringing the existing tab to front.
    store.openPanel('arxhub.welcome', {}, 'Welcome', undefined, () => true)
  },
})
