import { ArxHub, type Logger } from '@arxhub/core'
import { removeInfoSidecars } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { checkRegisteredComposition, SERVER_COMPOSITION } from '../composition'

export interface BootServerDeps {
  vfs: NodeFileSystem
  logger: Logger
}

export interface BootServerOptions {
  // The data root, read from the environment by the instance: it lives outside the artifact so
  // updating the server never touches the vault.
  dataDir: string
  // The headless counterpart of the client's crash screen — there is nobody here to click a button, so
  // the instance reads the same two switches off the environment and passes them through.
  disabled?: readonly string[]
  maintenance?: boolean
  version: string
  // The ONE place an instance lists its plugins. Boot registers none of its own.
  register(arxhub: ArxHub, deps: BootServerDeps): void | Promise<void>
}

// How a server instance comes up, as far as the plugins being registered. The caller starts it: the
// dev stand and the headless server do different things with a started hub.
export async function bootServer(options: BootServerOptions): Promise<ArxHub> {
  const arxhub = new ArxHub({ disabled: options.disabled, maintenance: options.maintenance })
  // FR-210: a problem report names the build it happened on, so the session log carries it from its first line.
  arxhub.logger.info(`ArxHub server ${options.version}`)
  const vfs = new NodeFileSystem(options.dataDir, arxhub.logger)

  // Every object the sync store ever received arrived through a write that left a sidecar beside it;
  // a server has no first paint to hold, so the one-time sweep runs here rather than detached as it
  // does on the clients. The dev stand shares a store layout with the headless one, so it sweeps too —
  // a store that never had sidecars simply finds none.
  const sidecars = await removeInfoSidecars(vfs)
  if (sidecars > 0) arxhub.logger.info(`Removed ${sidecars} legacy .arxmeta sidecars`)

  await options.register(arxhub, { vfs, logger: arxhub.logger })
  checkRegisteredComposition(arxhub, SERVER_COMPOSITION)

  return arxhub
}
