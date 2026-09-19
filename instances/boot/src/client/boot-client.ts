import { ArxHub, type Logger } from '@arxhub/core'
import { type Keyring, MutableRequestSigner } from '@arxhub/crypto'
import type { KeyStore } from '@arxhub/plugin-keystore'
import { resolveKeyStore } from '@arxhub/plugin-keystore/ui'
import { BootPolicy } from '@arxhub/plugin-maintenance'
import { startWithCrashScreen } from '@arxhub/plugin-maintenance/ui'
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { PanelStoreExtension, restoreNavigationWorkspace, StorePanelHost } from '@arxhub/plugin-panels'
import { loadOrCreateKeyring } from '@arxhub/plugin-protection'
import { ShellExtension, Workspace, WorkspaceStorage } from '@arxhub/plugin-shell'
import { ObjectGonePage } from '@arxhub/plugin-shell/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { type App, type Component, createApp, markRaw } from 'vue'
import { CLIENT_COMPOSITION, checkRegisteredComposition } from '../composition'

// Everything the boot has built by the time the instance names its plugins.
export interface BootClientDeps {
  vfs: VirtualFileSystem
  keystore: KeyStore
  keyring: Keyring
  policy: BootPolicy
}

export interface BootClientOptions {
  // A shipped, user-facing build never boots with its secrets in the clear, so it gates on first-run
  // lock setup. Dev and e2e leave it false: they seed a plaintext identity into storage before the app
  // runs and must come straight up with no interaction.
  requireLock: boolean
  // Where this instance's vault is — the native filesystem under Tauri, an HTTP backend in a browser.
  // Called after the keyring is installed into the signer, because a protected /vfs must already be
  // signed by the first request a plugin makes.
  createVfs(deps: { signer: MutableRequestSigner; logger: Logger }): Promise<VirtualFileSystem>
  // The ONE place an instance lists its plugins. Boot registers none of its own: WHAT runs is the
  // instance's decision, HOW it comes up is this package's.
  register(arxhub: ArxHub, deps: BootClientDeps): void | Promise<void>
  // Whatever only this instance contributes — an About page that knows which build it is, a Welcome
  // panel, a settings section one bundle has and another does not. Runs after the boot resolved (so
  // every extension exists) and before the desk is assembled.
  contribute?(arxhub: ArxHub): void | Promise<void>
  // Which frame this bundle mounts, as the import that fetches it. The choice is the instance's and
  // cannot be boot's: a Tauri package knows its frame as a build-time literal, so ITS ternary folds away
  // and the package ships the one shell it can mount — a branch written here would be a runtime one and
  // would put both shells in every bundle, including the phone's. A bundle genuinely served to both
  // frames hands over `shellForFrame(detectShellFrame())` and gets that runtime branch deliberately.
  // The shell itself publishes the frame to the tree (`provideShellFrame`), so nothing else needs it.
  loadShell(): Promise<Component>
  version: string
}

export interface BootedClient {
  arxhub: ArxHub
  workspace: Workspace
  app: App
}

// How a client instance comes up, from the boot policy to the mounted shell.
export async function bootClient(options: BootClientOptions): Promise<BootedClient> {
  // Read before anything else: a plugin the owner switched off (or a maintenance boot) must not get as
  // far as being constructed. The policy is device-local storage on purpose — see BootPolicy.
  const policy = new BootPolicy()
  const arxhub = new ArxHub({ disabled: policy.disabled, maintenance: policy.maintenance })
  // FR-210: a problem report names the build it happened on, so the session log carries it from its first line.
  arxhub.logger.info(`ArxHub ${options.version}`)

  // Resolve the device identity from client-local storage (never the server VFS) and install it into
  // the signer before start(). Blocks on the unlock prompt when the device is locked, or on first-run
  // lock setup when it never has been and this build requires one.
  const keystore = await resolveKeyStore({ requireLock: options.requireLock })
  const keyring = await loadOrCreateKeyring(keystore)
  const signer = new MutableRequestSigner()
  signer.install(keyring)

  const vfs = await options.createVfs({ signer, logger: arxhub.logger })
  await options.register(arxhub, { vfs, keystore, keyring, policy })
  checkRegisteredComposition(arxhub, CLIENT_COMPOSITION)

  // A failed boot lands on the crash screen instead of a blank page: it names the plugin that broke and
  // offers to switch it off (or to boot the essentials only) and try again. When every failure happened
  // in start(), carrying on is still an option — configure() had already registered the whole UI.
  await startWithCrashScreen(arxhub, policy)
  await options.contribute?.(arxhub)

  const shell = arxhub.extensions.get(ShellExtension)
  const panels = arxhub.extensions.get(PanelStoreExtension)

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
    createPanels: () => new StorePanelHost(panels.store),
    emit: (event, payload) => desk.observe(event, payload),
  })
  const desk = new WorkspaceStorage({ workspace })
  shell.attachWorkspace(workspace, desk)
  // Restored after every plugin has declared its types and before anything is on screen. Silently — a
  // restore is the initial state, not news. It also has no right to keep a person out of the
  // application: it reads storage, storage can be unavailable, and an unhandled rejection here would
  // fail BEFORE app.mount() and leave a blank white page instead of a shell.
  await restoreNavigationWorkspace(panels, workspace, desk, NOTES_TYPE_ID)

  const Shell = await options.loadShell()

  const app = createApp(Shell)
  app.provide(ARXHUB_KEY, arxhub)
  app.mount('#app')

  return { arxhub, workspace, app }
}
