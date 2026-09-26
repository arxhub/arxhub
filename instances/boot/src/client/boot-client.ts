import { ArxHub, type Logger } from '@arxhub/core'
import { type Keyring, MutableRequestSigner } from '@arxhub/crypto'
import { DOCUMENTS_TYPE_ID, migrateWorkspaceRecord } from '@arxhub/plugin-documents'
import type { KeyStore } from '@arxhub/plugin-keystore'
import { BootPolicy } from '@arxhub/plugin-maintenance'
import { startWithCrashScreen } from '@arxhub/plugin-maintenance/ui'
import { PanelStoreExtension, restoreNavigationWorkspace, StorePanelHost } from '@arxhub/plugin-panels'
import type { EntryRecord, EntryServer, QrScanPort } from '@arxhub/plugin-protection'
import { resolveDeviceEntry } from '@arxhub/plugin-protection/ui'
import { ShellExtension, Workspace, WorkspaceStorage } from '@arxhub/plugin-shell'
import { ObjectGonePage } from '@arxhub/plugin-shell/ui'
import { holdForInitialDownload } from '@arxhub/plugin-sync/ui'
import { ARXHUB_KEY, type ShellFrame } from '@arxhub/uikit/hooks'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { type App, type Component, createApp, markRaw } from 'vue'
import { CLIENT_COMPOSITION, checkRegisteredComposition } from '../composition'

// Everything the boot has built by the time the instance names its plugins.
export interface BootClientDeps {
  vfs: VirtualFileSystem
  keystore: KeyStore
  keyring: Keyring
  // What the first run left for the plugins to finish, handed to ProtectionPlugin.
  entry: EntryRecord | null
  policy: BootPolicy
}

export interface BootClientOptions {
  // Chosen once by the instance and shared by the pre-boot key-store gate and the eventual shell.
  frame: ShellFrame
  // A shipped, user-facing build never boots with its secrets in the clear, so a device from before the
  // first-run flow gates on lock setup. Dev and e2e leave it false: they seed a plaintext identity into
  // storage before the app runs and must come straight up with no interaction.
  requireLock: boolean
  // Where a new vault's server is: the page's own origin for a bundle a server serves, asked for by the
  // native app, which has no origin of its own.
  entryServer: EntryServer
  // A camera the join flow can scan an invitation with — only the native app on a phone has one to offer.
  pairingScanner?: QrScanPort
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
  // The shell itself publishes the frame to its tree; `frame` above also gives it to UI mounted before
  // that tree exists (the key-store gate).
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
  // the signer before start(). Blocks on the unlock prompt when the device is locked, on the first run's
  // chooser when it holds no identity, and on lock setup for a device from before that flow.
  const { keystore, keyring, entry } = await resolveDeviceEntry({
    frame: options.frame,
    requireLock: options.requireLock,
    server: options.entryServer,
    scanner: options.pairingScanner,
  })
  const signer = new MutableRequestSigner()
  signer.install(keyring)

  const vfs = await options.createVfs({ signer, logger: arxhub.logger })
  await options.register(arxhub, { vfs, keystore, keyring, entry, policy })
  checkRegisteredComposition(arxhub, CLIENT_COMPOSITION)

  // A failed boot lands on the crash screen instead of a blank page: it names the plugin that broke and
  // offers to switch it off (or to boot the essentials only) and try again. When every failure happened
  // in start(), carrying on is still an option — configure() had already registered the whole UI.
  await startWithCrashScreen(arxhub, policy, options.frame)
  await options.contribute?.(arxhub)
  // A device that has just joined a vault waits here, behind the download screen, until the vault is on
  // it: a desk assembled over half a vault would restore tabs onto files that have not arrived yet.
  // Any other boot passes straight through — including a maintenance boot or one with sync switched
  // off, which leave the join to be finished by the next normal one.
  await holdForInitialDownload(arxhub, options.frame)

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
    // Documents owns the vault objects; the same host also carries Welcome and the SQL console.
    createPanels: () => new StorePanelHost(panels.store),
    emit: (event, payload) => desk.observe(event, payload),
  })
  // A desk saved before Notes became Documents still names the old type; it is renamed on read.
  const desk = new WorkspaceStorage({ workspace, migrate: migrateWorkspaceRecord })
  shell.attachWorkspace(workspace, desk)
  // Restored after every plugin has declared its types and before anything is on screen. Silently — a
  // restore is the initial state, not news. It also has no right to keep a person out of the
  // application: it reads storage, storage can be unavailable, and an unhandled rejection here would
  // fail BEFORE app.mount() and leave a blank white page instead of a shell.
  await restoreNavigationWorkspace(panels, workspace, desk, DOCUMENTS_TYPE_ID)

  const Shell = await options.loadShell()

  const app = createApp(Shell)
  app.provide(ARXHUB_KEY, arxhub)
  app.mount('#app')

  return { arxhub, workspace, app }
}
