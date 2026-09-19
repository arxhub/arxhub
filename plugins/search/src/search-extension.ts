import type { PluginConfig } from '@arxhub/config'
import { Extension, type ExtensionArgs } from '@arxhub/core'
import {
  type Indexer,
  parseSearchQuery,
  SCHEMA_TABLES,
  type SearchOptions,
  type SearchResult,
  type SqlIndex,
  type SqlQueryResult,
  type SqlReadOnlyLimits,
  type SqlReadOnlyResult,
  type SqlRow,
  type SqlSchemaTable,
  searchDocuments,
} from '@arxhub/sql'
import { ref, shallowRef } from 'vue'
import { searchIndexUnavailable } from './errors'
import { DEFAULT_SEARCH_SETTINGS, reindexRequired, type SearchSettings } from './search-config'

// opening — the index is being opened, nothing can be asked yet. ready — it answers. scanning — it
// answers, and a walk of the content store is filling it. failed — it could not be opened at all, and
// the reason is in `error`.
export type SearchIndexStatus = 'opening' | 'ready' | 'scanning' | 'failed'

// Rejection code for a user query aimed at an index that is not open. Sits alongside the engine's own
// SQL_REJECTION codes in SqlReadOnlyFailure.code.
export const SEARCH_INDEX_UNAVAILABLE = 'index_unavailable'

// The only way into the index from another plugin (BR-03): the search plugin owns the lifecycle, and
// everyone else asks questions through here.
export class SearchExtension extends Extension {
  readonly status = ref<SearchIndexStatus>('opening')
  readonly documentCount = ref(0)
  // Files the walk in progress (or the one that finished last) has handled — what a progress line shows
  // while the index catches up (FR-227).
  readonly processed = ref(0)
  readonly lastScan = ref<Date | null>(null)
  readonly error = ref<string | null>(null)
  // Bumped every time the index's contents may have moved under a reader — a walk making progress, a saved
  // note reindexed, a deleted one swept. A counter rather than a count, because an edit that leaves the
  // number of documents alone still changes what a query answers, and a list already on screen has no other
  // way to learn that it went stale (FR-225).
  readonly revision = ref(0)
  // What the settings section last saved, already read and sanitised. Every limit and tunable below comes
  // from here rather than from a module constant, so a value the owner changed takes effect on the next
  // query or the next walk without a restart.
  // shallowRef, not ref: the values are replaced whole, never mutated in place, so there is nothing for a
  // deep proxy to earn.
  readonly settings = shallowRef<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
  // Whether anything has replaced the defaults yet. The plugin reads the settings file after the app has
  // already painted (the index bring-up is detached from the boot), so the settings section could in
  // principle save in between — and what it wrote is newer than what that read returns.
  settingsApplied = false
  index: SqlIndex | null = null
  // The walk over the content store. Other plugins reach it to keep a document they just wrote fresh
  // (FR-225) — the search plugin owns it and mirrors its status into the refs above.
  indexer: Indexer | null = null
  // The plugin's own scoped config service, assigned in configure(). The settings section builds its form
  // from SearchConfigSchema and persists through this, so it can never write outside the plugin's sandbox.
  config!: PluginConfig

  // Resolves once the open attempt has finished — either way. A plugin asking a question during boot must
  // not be told "unavailable" merely because it was early (BE 2.1), so the query paths await this first.
  private readonly opened: Promise<void>
  private settle: (() => void) | null = null

  constructor(args: ExtensionArgs) {
    super(args)
    this.opened = new Promise<void>((resolve) => {
      this.settle = resolve
    })
  }

  // Called by the plugin when the index is open, when the open failed, and when the plugin stops: after
  // any of those, `status` is the truth and there is nothing left to wait for. Idempotent.
  settled(): void {
    const resolve = this.settle
    this.settle = null
    resolve?.()
  }

  // Waits out the opening phase. Public because a caller that wants to look at `status` itself (a status
  // line, a disabled control) still needs a way to know the answer is final.
  whenSettled(): Promise<void> {
    return this.opened
  }

  // What the tables and columns of the index MEAN — the half a database cannot answer about itself.
  // Shape (types, keys, nullability) is read from the live catalog instead, so it cannot drift from the
  // DDL; this is a constant, so a console still has something to show before the index has opened and
  // after one has failed to.
  get schema(): readonly SqlSchemaTable[] {
    return SCHEMA_TABLES
  }

  // Takes saved settings into use. Answers whether the change alters what the index CONTAINS — the caller
  // (the settings section) then rebuilds, because no query can recover rows the previous rule kept out.
  applySettings(next: SearchSettings): boolean {
    const rebuild = reindexRequired(this.settings.value, next)
    this.settings.value = next
    this.settingsApplied = true
    return rebuild
  }

  // What the shell background line shows while the index opens or a walk runs — no owner, same wording as
  // the Search rail and settings section (`useIndexStatus`).
  busyWork(): { label: string } | null {
    if (this.status.value === 'opening') return { label: 'Opening the index…' }
    if (this.status.value === 'scanning') return { label: `Indexing… ${this.processed.value} processed` }
    return null
  }

  // Throws the index away and builds it again (FR-226). Starting it twice does not start two walks — the
  // second call joins the first.
  async reindex(): Promise<void> {
    await this.opened
    const indexer = this.indexer
    if (indexer == null) throw searchIndexUnavailable(this.error.value)
    await indexer.reindex()
  }

  // Answers a search string. The parse and the query are composed here rather than in the engine because
  // the engine has no reason to hide the parse: what came back incomplete about the string is part of the
  // answer, and the interface shows it next to the input (FR-234).
  // Rejects rather than answering with an empty result when there is no index — and an invalid regular
  // expression rejects too, so the interface can leave the previous list in place (FR-232). Waits out an
  // index that is merely still opening: the field is live from the first paint, and a word typed into it
  // one second into the boot deserves an answer rather than "the index is not open".
  async search(input: string, options: SearchOptions = {}): Promise<SearchResult> {
    await this.opened
    const index = this.index
    if (index == null) throw searchIndexUnavailable(this.error.value)
    const settings = this.settings.value
    // The caller's options win: the settings are the defaults for what nobody asked about.
    return searchDocuments(index, parseSearchQuery(input), {
      snippetsPerDocument: settings.snippetsPerDocument,
      snippetWords: settings.snippetWords,
      fuzzyThreshold: settings.fuzzyThreshold,
      ...options,
    })
  }

  // The plugin path: parameters bound, no READ ONLY transaction and no row limit — a plugin is part of
  // the product, not user input. Waits out an index that is still opening, then rejects rather than
  // answering with no rows: "nothing matches" is a different answer from "there was nothing to ask"
  // (FR-238).
  async query<R = SqlRow>(sql: string, params?: unknown[]): Promise<SqlQueryResult<R>> {
    await this.opened
    const index = this.index
    if (index == null) throw searchIndexUnavailable(this.error.value)
    return index.query<R>(sql, params)
  }

  // The user path: one statement, READ ONLY, limited by what the settings section holds. A missing index
  // is a rejection like any other — the console shows it and stays usable (FR-237).
  async readOnly<R = SqlRow>(sql: string, params?: unknown[], limits?: SqlReadOnlyLimits): Promise<SqlReadOnlyResult<R>> {
    await this.opened
    const index = this.index
    if (index == null) {
      return {
        ok: false,
        message: this.error.value ?? 'The search index is not open.',
        code: SEARCH_INDEX_UNAVAILABLE,
        position: null,
        durationMs: 0,
      }
    }
    const settings = this.settings.value
    // Spread would not do: a caller passing `{ maxRows: undefined }` would erase the configured value and
    // land on the engine's own default instead of the owner's.
    return index.readOnly<R>(sql, params, {
      maxRows: limits?.maxRows ?? settings.maxRows,
      timeoutMs: limits?.timeoutMs ?? settings.timeoutMs,
    })
  }
}
