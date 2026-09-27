import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import type { RepositoryExtension } from '@arxhub/plugin-repository'
import type { FetchProgress, SyncEngine } from '@arxhub/sync'
import { ref, shallowRef } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'error'

// A joining device's first download, which the app is held behind until it lands (entry flow v2).
// `waiting` is the stretch between boot and the remote being built; `none` means this boot owes no
// download at all and nothing is held.
export type InitialDownloadStatus = 'none' | 'waiting' | 'running' | 'done' | 'failed'

export interface InitialDownload {
  status: InitialDownloadStatus
  progress: FetchProgress | null
  error: string | null
  // What `error` came from, for the gate to say in the reader's language — `error` itself stays the
  // English message logs and tests read.
  cause?: unknown
}

// What the plugin does around a first download that the extension cannot: finishing the join once the
// vault is here (config, entry record), and bringing the remote up again when it never got built.
export interface InitialDownloadHooks {
  finish(): Promise<void>
  retry(): Promise<void>
}

export interface SyncExtensionArgs extends ExtensionArgs {
  // The local half of the same object — Sync is the remote exchange layered over it (A-50). Fixed at
  // construction: Repository is essential, so it outlives Sync for the whole of this plugin's life.
  repository: RepositoryExtension
}

export class SyncExtension extends Extension {
  readonly status = ref<SyncStatus>('idle')
  readonly lastSynced = ref<Date | null>(null)
  readonly lastError = ref<string | null>(null)
  readonly lastFailure = shallowRef<unknown>(null)
  // Conflict copies the MOST RECENT sync round wrote (vault paths, cleared at the start of the next
  // round) — the only way today a user learns a conflict exists at all short of stumbling on a
  // `conflict-*` file while browsing. Not cumulative across rounds: a UI reacting to it (a toast) is
  // meant to fire once per round, not re-announce an older conflict the user already saw.
  readonly lastConflicts = ref<string[]>([])
  // Same "most recent round only" shape, for the two other things a merge can report: a path a content
  // merger absorbed conflicts into (still unresolved INSIDE the file, e.g. a `.arx` conflict block —
  // see `arx-merge.ts`) rather than writing a copy beside it, and a path where an edit won over a
  // delete because there was no document left on the other side to hold a decision in.
  readonly lastUnresolved = ref<{ pathname: string; count: number }[]>([])
  readonly lastDecisions = ref<{ pathname: string; kind: 'edit-over-delete' }[]>([])
  readonly initialDownload = shallowRef<InitialDownload>({ status: 'none', progress: null, error: null })
  engine: SyncEngine | null = null

  private readonly repository: RepositoryExtension
  private initialHooks: InitialDownloadHooks | null = null
  // The round in flight, so a first download started while a timer round runs waits for it and then
  // runs its own full round rather than returning as if the vault had arrived.
  private round: Promise<void> | null = null

  constructor(args: SyncExtensionArgs) {
    super(args)
    this.repository = args.repository
  }

  // Bring a file this device left in the cloud onto disk. `path` in the repo's coordinates (vault/…).
  async materialize(path: string): Promise<void> {
    if (!this.engine) throw illegalState('Connect to the sync server to download this file.')
    await this.engine.materialize(path)
    // Materializing may have resolved a pending path the repository is tracking.
    await this.repository.refreshPending()
  }

  // A slice of a file left in the cloud, without materialising it. `path` in the repo's coordinates
  // (vault/…) — same convention as materialize above.
  async readRange(path: string, offset: number, length?: number): Promise<Uint8Array> {
    if (!this.engine) throw illegalState('Connect to the sync server to read this file.')
    return this.engine.readRange(path, offset, length)
  }

  // A round looks at what the journal names — every vault write the watcher saw since the last one —
  // plus the whole of storage/, which nothing observes (config saves go through an unwrapped view and
  // the tree is a handful of files). `full` adds the whole vault: the first round of a session and a
  // manual "Sync now", because an edit made while the app was not running reached no watcher, and a
  // stat-walk is what finds it. It costs one head() per file and no reads, which is why it is not
  // every round: on a phone, thirty seconds is not long enough to justify statting the whole vault.
  sync(options: { full?: boolean } = {}): Promise<void> {
    if (!this.engine || this.status.value === 'syncing') return Promise.resolve()
    const round = this.runRound(this.engine, options).finally(() => {
      if (this.round === round) this.round = null
    })
    this.round = round
    return round
  }

  // Called by the plugin at start() on a device that is joining a vault: until downloadVault() lands,
  // the boot holds the app behind the download screen.
  expectInitialDownload(hooks: InitialDownloadHooks): void {
    this.initialHooks = hooks
    this.initialDownload.value = { status: 'waiting', progress: null, error: null }
  }

  // Whether a remote built now owes the joining device's first download rather than an ordinary round.
  // Once that download has landed the session is an ordinary one again, whatever the screen last said.
  get owesInitialDownload(): boolean {
    return this.initialHooks != null && this.initialDownload.value.status !== 'done'
  }

  failInitialDownload(message: string, cause?: unknown): void {
    if (this.initialHooks == null) return
    this.initialDownload.value = { ...this.initialDownload.value, status: 'failed', error: message, cause }
  }

  // The joining device's first round: full, reported as it goes, and finished (config written, entry
  // record cleared) only once it landed. A failure leaves the record, so the next attempt — "Try again"
  // or the next boot — picks up the chunks already stored and fetches only the rest.
  async downloadVault(): Promise<void> {
    const hooks = this.initialHooks
    const state = this.initialDownload.value.status
    if (hooks == null || state === 'running' || state === 'done') return
    const engine = this.engine
    if (engine == null) {
      this.initialDownload.value = { status: 'waiting', progress: null, error: null }
      await hooks.retry()
      return
    }
    this.initialDownload.value = { status: 'running', progress: this.initialDownload.value.progress, error: null }
    const unsubscribe = engine.events.on('progress', (progress) => {
      this.initialDownload.value = { ...this.initialDownload.value, progress }
    })
    try {
      if (this.round != null) await this.round
      await this.sync({ full: true })
    } finally {
      unsubscribe()
    }
    if (this.status.value === 'error') {
      this.initialDownload.value = {
        ...this.initialDownload.value,
        status: 'failed',
        error: this.lastError.value,
        cause: this.lastFailure.value,
      }
      return
    }
    try {
      await hooks.finish()
    } catch (error) {
      this.logger.error('Could not finish connecting this device', error)
      this.initialDownload.value = {
        ...this.initialDownload.value,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        cause: error,
      }
      return
    }
    this.initialHooks = null
    this.initialDownload.value = { ...this.initialDownload.value, status: 'done', error: null, cause: undefined }
  }

  private async runRound(engine: SyncEngine, options: { full?: boolean }): Promise<void> {
    this.status.value = 'syncing'
    this.lastError.value = null
    this.lastFailure.value = null
    this.lastConflicts.value = []
    this.lastUnresolved.value = []
    this.lastDecisions.value = []
    try {
      if (options.full === true) await engine.add('vault')
      await engine.add('storage')
      const result = await engine.sync()
      this.lastSynced.value = new Date()
      this.lastConflicts.value = result.conflicts
      this.lastUnresolved.value = result.unresolved
      this.lastDecisions.value = result.decisions
      this.status.value = 'idle'
    } catch (error) {
      // Don't swallow: log for diagnostics and expose the message so the footer can surface it.
      this.logger.error('Sync failed', error)
      this.lastError.value = error instanceof Error ? error.message : String(error)
      this.lastFailure.value = error
      this.status.value = 'error'
    } finally {
      // storage/ has no watcher of its own. Signal consumers before the asynchronous pending refresh,
      // including after a round that failed after partially reconciling the local tree.
      this.repository.refreshStorage()
      // Either outcome may have changed what is pending — a round that failed partway can still have
      // merged a head that left new files in the cloud.
      await this.repository.refreshPending()
    }
  }
}
