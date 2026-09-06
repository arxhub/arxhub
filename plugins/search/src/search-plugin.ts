import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { EXPLORER_SIDEBAR_ITEM, ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { createIndexer, type IndexerStatus, openSqlIndex, type SqlIndex } from '@arxhub/sql'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { markRaw, watch } from 'vue'
import { SEARCH_SETTINGS_SECTION, SEARCH_SIDEBAR_ITEM, SQL_CONSOLE_PANEL } from './contributions'
import { createIndexQueue, type IndexQueue } from './index-queue'
import { manifest } from './manifest'
import { openWithRetry } from './open-index'
import { SearchConfigSchema, toSearchSettings } from './search-config'
import { SearchExtension } from './search-extension'
import SearchLayout from './ui/SearchLayout.vue'
import SearchRail from './ui/SearchRail.vue'
import SearchSettingsPage from './ui/SearchSettingsPage.vue'
import SqlConsolePanel from './ui/SqlConsolePanel.vue'

export interface SearchPluginArgs extends PluginArgs {
  // Where the index lives. The instance decides, because it is the thing that knows which storage it
  // has: 'idb://<name>' in a browser or under Tauri, 'memory://' in a test. Never a path inside the
  // content store — the index is derived and device-local, and sync must not walk it (FR-214).
  dataDir: string
}

export class SearchPlugin extends Plugin {
  private readonly dataDir: string
  private index: SqlIndex | null = null
  private unsubscribe: (() => void) | null = null
  private unwatch: (() => void) | null = null
  private unwatchSettings: (() => void) | null = null
  private queue: IndexQueue | null = null
  // The detached bring-up, while it runs. stop() awaits it rather than tearing down underneath it.
  private bringUp: Promise<void> | null = null
  private stopping = false

  constructor(args: SearchPluginArgs) {
    super(args, manifest)
    this.dataDir = args.dataDir
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SearchExtension)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const search = ctx.extensions.get(SearchExtension)
    search.config = ctx.services.get(PluginConfig)

    // One registration for both frames: the desktop rail renders it as a section, from the same item —
    // the frame decides where a mini-app lands, the plugin does not (FR-228). absorbedOnMobileBy is the
    // one declarative exception: on a phone Search has no bottom-bar destination of its own (see the
    // rail-tab contribution below instead), so the mobile frame drops it from its tab row and the More
    // sheet on that account without either frame or plugin naming the other.
    ctx.extensions.get(ShellExtension).sidebar.register({
      id: SEARCH_SIDEBAR_ITEM,
      icon: 'lu:search',
      title: 'Search',
      layout: SearchLayout,
      order: 10,
      absorbedOnMobileBy: EXPLORER_SIDEBAR_ITEM,
    })

    // Explorer is switchable and Search does not otherwise depend on it — a device that disabled
    // Explorer must not lose Search over a missing contribution target. Contributed unconditionally
    // otherwise (not gated on frame): Explorer's own mobile-only rail switcher is the thing that decides
    // whether to render this at all, the same way desktop's rail never reads getRailTabs() in the first
    // place, so nothing here has to ask which frame it is running on.
    if (ctx.extensions.has(ExplorerExtension)) {
      ctx.extensions.get(ExplorerExtension).registerRailTab({
        id: SEARCH_SIDEBAR_ITEM,
        title: 'Search',
        icon: 'lu:search',
        component: markRaw(SearchRail),
      })
    }

    // The console is a content panel on the workspace store, not a screen of its own: the owner opens it
    // from the Search rail and it sits beside the notes, in whichever frame is running (FR-236).
    ctx.extensions.get(PanelStoreExtension).store.registerPanel({
      id: SQL_CONSOLE_PANEL,
      title: 'SQL console',
      icon: 'lu:terminal',
      component: SqlConsolePanel,
    })

    // A custom component rather than a bare schema section: the form itself is still generated from
    // SearchConfigSchema by the settings kit, but the section also has to show what the index holds and
    // offer to rebuild it — and a rebuild applies at once instead of joining the staged change set.
    ctx.extensions.get(SettingsExtension).register({
      id: SEARCH_SETTINGS_SECTION,
      title: 'Search',
      icon: 'lu:search',
      order: 12,
      component: markRaw(SearchSettingsPage),
    })
  }

  // `start()` must not hold the first paint. `ArxHub.start()` awaits every plugin's start(), and a cold
  // PGlite costs about a second (it fetches and boots a WASM payload) — so opening the index here would
  // mean a second of blank page, and more than that on a slow machine or with several tabs coming up at
  // once. The bring-up is therefore detached, exactly as the walk already was (FR-223): this returns as
  // soon as the status says `opening`, and everything that needs the index awaits readiness instead of
  // assuming it. FR-216 is unaffected — a failed open still ends as `status = 'failed'` with its reason,
  // only asynchronously.
  // Deliberately NOT async: every line below runs in the caller's own tick, so a stop() arriving in the
  // same tick always finds `bringUp` already assigned. With an `await super.start(ctx)` first, the two
  // would interleave — stop() would see no bring-up to wait for, and the resumed start() would then open
  // an index nothing is left to close.
  override start(ctx: PluginContext): Promise<void> {
    const starting = super.start(ctx)

    const search = ctx.extensions.get(SearchExtension)
    search.status.value = 'opening'
    this.stopping = false
    this.bringUp = this.bringUpIndex(ctx, search)

    return starting
  }

  private async bringUpIndex(ctx: PluginContext, search: SearchExtension): Promise<void> {
    try {
      // Still read before the index opens, because `exclude` and `maxFileSize` decide what the very first
      // walk covers. tryRead, not read: the settings store may be unreachable (the product works offline),
      // and a search plugin that gives up over that is worse than one running on the defaults.
      const config = await search.config.tryRead(SearchConfigSchema)
      // Not applied over a save that landed while this read was in flight: the app is already painted by
      // now, so the settings section is reachable, and the file it wrote is newer than what came back here.
      if (!search.settingsApplied) search.applySettings(toSearchSettings(config ?? {}))
      const settings = search.settings.value
      if (this.stopping) return

      // Retried, because the store can lose a race it wins a moment later — a reload landing on the
      // previous page's teardown contends for the same IndexedDB origin. Only a store failure is retried;
      // a dataDir the engine refuses is refused identically every time (see open-index.ts). Bounded to
      // well under a second in total: the app is already painted, but a genuinely unavailable index still
      // has to say so promptly rather than after a visible pause.
      const index = await openWithRetry({
        open: () => openSqlIndex({ dataDir: this.dataDir }),
        attempts: 3,
        delayMs: (retry) => retry * 150,
        cancelled: () => this.stopping,
        onRetry: (retry, error) => this.logger.warn(`The search index did not open (attempt ${retry}) — trying again`, error),
      })
      // Stopped while the index was opening. Closing it here rather than leaving it to the teardown: the
      // teardown only knows about `this.index`, and assigning it now would race a stop that has already
      // walked past that line. A live WASM instance — and, in the browser, an open IndexedDB handle —
      // must not outlive the plugin.
      if (this.stopping) {
        await index.close().catch(() => undefined)
        return
      }
      // Assigned before anything else can fail, so the teardown always has something to close.
      this.index = index

      await readIndexState(index, search)
      if (this.stopping) return
      search.index = index
      search.status.value = 'ready'

      // The walk reads the vault view, never the whole tree: plugin buckets, device-local state and sync
      // objects are not documents (FR-219).
      const indexer = createIndexer(index, ctx.services.get(VaultVfs), {
        logger: this.logger.child({ name: 'indexer' }),
        exclude: settings.exclude,
        maxFileSize: settings.maxFileSize,
      })
      search.indexer = indexer
      this.unsubscribe = indexer.subscribe((status) => applyIndexerStatus(search, status))

      // Freshness comes from watching the content store, not from editors calling us: no editor knows the
      // index exists, and the one place a write can be seen is the view every writer goes through
      // (FR-225). Subscribed before the walk starts, so a note saved while the walk runs is not missed.
      const queue = createIndexQueue({ indexer, logger: this.logger.child({ name: 'queue' }), debounceMs: settings.debounceMs })
      this.queue = queue
      this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => queue.push(change))

      // The extension owns the values, the plugin owns the wiring — a saved setting reaches the walk and
      // the queue through here. Synchronous flush on purpose: the settings section rebuilds the index right
      // after it applies a change, and a deferred callback would have that rebuild run under the old
      // `exclude`.
      this.unwatchSettings = watch(
        search.settings,
        (values) => {
          queue.debounceMs = values.debounceMs
          indexer.configure({ exclude: values.exclude, maxFileSize: values.maxFileSize })
        },
        { flush: 'sync' },
      )

      // Not awaited: the catch-up runs in the background so nothing waits for a walk of the whole content
      // store (FR-223). Search answers over what is already indexed and says that a walk is running.
      void indexer.scan().catch((error: unknown) => {
        this.logger.error('The index walk did not finish', error)
      })
    } catch (error) {
      // Search is a feature, not the app: an index that will not open leaves the vault readable and
      // editable, so the failure is reported and the app carries on (FR-216). Everything that reads the
      // index asks `status` first and finds `failed`.
      this.logger.error('Could not open the search index — search is unavailable this session', error)
      search.error.value = error instanceof Error ? error.message : String(error)
      search.status.value = 'failed'
    } finally {
      // However this ended, nothing more is coming: a caller awaiting readiness is let go here, with
      // `status` as its answer. In the `stopping` cases stop() resolves it too — settled() is idempotent.
      search.settled()
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    // Set before anything is torn down, so a bring-up still in flight sees it at its next checkpoint and
    // stops installing things behind the teardown's back.
    this.stopping = true
    const bringUp = this.bringUp
    this.bringUp = null
    // The bring-up may be halfway through opening the index. Awaiting it is what keeps a start/stop race
    // from leaving a live PGlite handle behind, or from starting a walk against an index this is closing.
    await bringUp?.catch(() => undefined)

    this.unwatchSettings?.()
    this.unwatchSettings = null
    this.unsubscribe?.()
    this.unsubscribe = null

    // Unsubscribe before cancelling anything: a write arriving now would queue work against an index
    // that is about to close.
    this.unwatch?.()
    this.unwatch = null
    const queue = this.queue
    this.queue = null
    queue?.dispose()
    // A drain in flight is writing to the index right now; it takes no cancellation because a single
    // path is quick, so it is simply awaited out.
    await queue?.running?.catch(() => undefined)

    const search = ctx.extensions.get(SearchExtension)
    // Whatever a caller was waiting for, it is not coming after a stop.
    search.settled()
    const indexer = search.indexer
    search.indexer = null
    if (indexer != null) {
      // The walk holds transactions of its own: closing the index under it would fail them and, in the
      // browser, leave the storage handle open.
      indexer.cancel()
      await indexer.running?.catch(() => undefined)
    }

    if (this.index != null) {
      const index = this.index
      this.index = null
      search.index = null
      await index.close()
    }
    await super.stop(ctx)
  }
}

// What the status surfaces show before anything has been searched: how much is in the index and when it
// was last walked.
async function readIndexState(index: SqlIndex, search: SearchExtension): Promise<void> {
  const { rows } = await index.query<{ documents: number; last_scan: string | null }>(
    `SELECT (SELECT count(*)::int FROM document) AS documents,
            (SELECT value FROM index_meta WHERE key = 'last_scan_finished_at') AS last_scan`,
  )
  search.documentCount.value = rows[0]?.documents ?? 0
  const lastScan = rows[0]?.last_scan
  const parsed = lastScan == null ? Number.NaN : Number.parseInt(lastScan, 10)
  search.lastScan.value = Number.isFinite(parsed) ? new Date(parsed) : null
}

function applyIndexerStatus(search: SearchExtension, status: IndexerStatus): void {
  search.documentCount.value = status.documentCount
  search.processed.value = status.processed
  // The indexer reports a snapshot after every write it makes, so this is the one place that knows the
  // index moved. Bumped unconditionally: a reindexed note leaves `documentCount` untouched and would
  // otherwise be invisible to anything watching for a change.
  search.revision.value += 1
  if (status.lastScanFinishedAt != null) search.lastScan.value = status.lastScanFinishedAt
  // 'failed' means there is no index at all — a walk cannot report over that.
  if (search.status.value === 'failed') return
  search.status.value = status.state === 'scanning' ? 'scanning' : 'ready'
}
