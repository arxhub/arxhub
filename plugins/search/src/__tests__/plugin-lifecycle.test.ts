import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginConfig } from '@arxhub/config'
import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { illegalState } from '@arxhub/errors'
import { createEventBus, type EventMap } from '@arxhub/events'
import {
  ScopedFileSystem,
  VaultVfs,
  VaultWatcher,
  type VfsChange,
  type VfsChangeListener,
  type VfsChangeSource,
  type VirtualFileSystem,
} from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SearchExtension } from '../search-extension'
import { SearchPlugin } from '../search-plugin'
import { silentLogger } from './fake-indexer'

// Counts its subscribers, which is the observable that matters here: the queue's subscription is the LAST
// thing the bring-up installs, so a subscriber still attached after a stop means the bring-up carried on
// behind the teardown's back.
class CountingWatcher implements VfsChangeSource {
  readonly listeners = new Set<VfsChangeListener>()

  subscribe(listener: VfsChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(change: VfsChange): void {
    for (const listener of this.listeners) listener(change)
  }
}

// The plugin's storage view with a hold on its reads. The bring-up's first step is reading the config file,
// so parking that read parks the bring-up at a known point — which is what lets a stop be made to land
// while it is genuinely in flight, rather than at whatever moment a sleep happens to pick.
class GatedStorage extends ScopedFileSystem {
  private release: (() => void) | null = null
  private arrived: (() => void) | null = null
  // Resolves once the bring-up has actually reached the read and suspended on it.
  readonly reached: Promise<void>

  constructor(inner: VirtualFileSystem, prefix: string) {
    super(inner, prefix)
    this.reached = new Promise<void>((resolve) => {
      this.arrived = resolve
    })
  }

  override async read(pathname: string): Promise<Uint8Array> {
    this.arrived?.()
    this.arrived = null
    await new Promise<void>((resolve) => {
      this.release = resolve
    })
    return super.read(pathname)
  }

  open(): void {
    const release = this.release
    this.release = null
    release?.()
  }
}

let rootDir: string
let plugin: SearchPlugin | null = null
let ctx: PluginContext
let watcher: CountingWatcher

// The real plugin against the real containers, minus configure(): everything under test is in start() and
// stop(), and configure() would pull in the shell, panels and settings extensions this says nothing about.
function build(dataDir = 'memory://', gate?: (storage: VirtualFileSystem) => VirtualFileSystem): SearchExtension {
  const logger = silentLogger()
  const root = new NodeFileSystem(rootDir, logger)
  const extensions = new ExtensionContainer({ logger })
  watcher = new CountingWatcher()

  const services = new LazyContainer<object>('Service')
  services.bind(VaultVfs, () => new ScopedFileSystem(root, 'vault'))
  services.bind(VaultWatcher, () => watcher)
  ctx = { extensions, events: createEventBus<EventMap>(), services }

  plugin = new SearchPlugin({ logger, dataDir })
  plugin.create(ctx)
  const search = extensions.get(SearchExtension)
  // What ConfigPlugin + the plugin's own configure() would have wired. The file need not exist — the
  // schema's defaults are the answer then.
  const storage = gate?.(root) ?? new ScopedFileSystem(root, 'storage/search')
  search.config = new PluginConfig(storage, logger)
  return search
}

beforeEach(async () => {
  rootDir = await fs.mkdtemp(join(tmpdir(), 'arxhub-search-lifecycle-'))
  await fs.mkdir(join(rootDir, 'vault'), { recursive: true })
})

afterEach(async () => {
  // Every case leaves the plugin stopped, so a PGlite instance never outlives it.
  if (plugin != null) await plugin.stop(ctx).catch(() => undefined)
  plugin = null
  await fs.rm(rootDir, { recursive: true, force: true })
})

describe('starting without holding the first paint', () => {
  it('returns before the index is open, leaving the status at opening', async () => {
    const search = build()

    await plugin?.start(ctx)

    // The whole point: ArxHub.start() awaits this, and a cold PGlite costs about a second (it fetches and
    // boots a WASM payload). Resolving only once the index was up meant a second of blank page.
    expect(search.status.value).toBe('opening')
    expect(search.index).toBeNull()
    expect(search.indexer).toBeNull()

    await search.whenSettled()
    expect(search.status.value).toBe('ready')
    expect(search.index).not.toBeNull()
    expect(search.indexer).not.toBeNull()
  })

  it('reads the config before the first walk, so exclude is in force from the start', async () => {
    await fs.mkdir(join(rootDir, 'storage', 'search'), { recursive: true })
    await fs.writeFile(join(rootDir, 'storage', 'search', 'config.toml'), '"index.exclude" = [ "drafts/" ]\n"sql.maxRows" = 7\n')
    await fs.writeFile(join(rootDir, 'vault', 'keep.md'), '# Keep\n')
    await fs.mkdir(join(rootDir, 'vault', 'drafts'), { recursive: true })
    await fs.writeFile(join(rootDir, 'vault', 'drafts', 'skip.md'), '# Skip\n')

    const search = build()
    await plugin?.start(ctx)
    await search.whenSettled()
    // The walk is detached from start(), so it is awaited through the indexer rather than through start().
    await search.indexer?.running

    expect(search.settings.value.exclude).toEqual(['drafts/'])
    expect(search.settings.value.maxRows).toBe(7)
    const { rows } = await search.query<{ path: string }>('SELECT path FROM document ORDER BY path')
    expect(rows.map((row) => row.path)).toEqual(['keep.md'])
  })

  it('answers a query issued while the index is still opening instead of refusing it', async () => {
    const search = build()
    await plugin?.start(ctx)

    // Asked DURING the open, which is the case the readiness gate exists for: the search field is live
    // from the first paint, so a word typed a moment into the boot has to be answered.
    const answer = search.query<{ one: number }>('SELECT 1::int AS one')
    expect(search.status.value).toBe('opening')

    const { rows } = await answer
    expect(rows[0].one).toBe(1)
  })
})

describe('telling a reader the index moved', () => {
  it('advances the revision for a reindex that leaves the document count alone', async () => {
    await fs.writeFile(join(rootDir, 'vault', 'note.md'), '# Note\n\nfirst wording\n')

    const search = build()
    await plugin?.start(ctx)
    await search.whenSettled()
    await search.indexer?.running

    const afterWalk = search.revision.value
    // The walk reported at least once, which is what a list rendered mid-walk is waiting to hear.
    expect(afterWalk).toBeGreaterThan(0)
    expect(search.documentCount.value).toBe(1)

    // An edit in place: the same one document, different words. This is the case a count cannot carry —
    // hence a counter (FR-225).
    await fs.writeFile(join(rootDir, 'vault', 'note.md'), '# Note\n\nsecond wording\n')
    await search.indexer?.indexPath('note.md')

    expect(search.documentCount.value).toBe(1)
    expect(search.revision.value).toBeGreaterThan(afterWalk)
    const { rows } = await search.query<{ content: string }>("SELECT content FROM document WHERE path = 'note.md'")
    expect(rows[0].content).toContain('second wording')
  })
})

describe('an index that will not open', () => {
  it('ends as failed with a reason, asynchronously, and never rejects start()', async () => {
    // An empty dataDir is refused by the engine before PGlite is touched — a deterministic stand-in for the
    // browser case (no IndexedDB), which cannot be produced under vitest.
    const search = build('')

    await expect(plugin?.start(ctx)).resolves.toBeUndefined()
    await search.whenSettled()

    expect(search.status.value).toBe('failed')
    expect(search.error.value).toContain('dataDir')
  })

  it('tells a plugin why rather than answering with no rows', async () => {
    const search = build('')
    await plugin?.start(ctx)
    await search.whenSettled()

    await expect(search.query('SELECT 1')).rejects.toThrow(/not open/)
    const answer = await search.readOnly('SELECT 1')
    expect(answer.ok).toBe(false)
    // The schema is a constant of the engine, not a question put to the database, so it is still right.
    expect(search.schema.map((table) => table.name)).toContain('document')
  })
})

describe('stopping while the bring-up is still in flight', () => {
  it('does not resolve until the bring-up has finished', async () => {
    // Held on an object rather than in a `let`: the gate is built inside the factory, and reading it back
    // through a property is what keeps this honest without a cast.
    const held: { gate: GatedStorage | null } = { gate: null }
    const search = build('memory://', (root) => {
      const gate = new GatedStorage(root, 'storage/search')
      held.gate = gate
      return gate
    })
    const gate = held.gate
    if (gate == null) throw illegalState('the gated storage was not installed')

    await plugin?.start(ctx)
    // The bring-up is now suspended inside the config read, which is where a stop has to be able to land.
    await gate.reached

    let stopped = false
    const stopping = plugin?.stop(ctx).then(() => {
      stopped = true
    })

    // A full macrotask: more than enough for a stop() that does NOT await the bring-up to run its whole
    // teardown and resolve. This is the assertion that fails the moment that await is dropped.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(stopped).toBe(false)

    gate.open()
    await stopping
    expect(stopped).toBe(true)
    expect(search.index).toBeNull()
    expect(search.indexer).toBeNull()
    expect(watcher.listeners.size).toBe(0)
    plugin = null
  }, 30_000)

  it('leaves nothing open, nothing running and nothing subscribed', async () => {
    const search = build()
    const started = plugin?.start(ctx)
    // No await between them: the stop lands while openSqlIndex is mid-flight, which is what a boot the
    // owner navigates away from — or a maintenance restart — really produces.
    await plugin?.stop(ctx)
    await started

    expect(search.index).toBeNull()
    expect(search.indexer).toBeNull()
    // Resolved by the bring-up or by the stop — a caller must never hang on a plugin that is gone.
    await expect(search.whenSettled()).resolves.toBeUndefined()

    // Longer than a cold PGlite takes to come up. This is the assertion that fails if stop() stops awaiting
    // the bring-up: the bring-up would reach its install step about now and hand a walk, a queue and a
    // subscription to an index the teardown has already walked past.
    await new Promise((resolve) => setTimeout(resolve, 3000))

    expect(search.index).toBeNull()
    expect(search.indexer).toBeNull()
    expect(search.status.value).not.toBe('ready')
    expect(watcher.listeners.size).toBe(0)
    plugin = null
  }, 30_000)

  it('closes the index and drops the subscription when the stop comes after it is up', async () => {
    const search = build()
    await plugin?.start(ctx)
    await search.whenSettled()
    const index = search.index
    expect(index).not.toBeNull()
    expect(watcher.listeners.size).toBe(1)

    await plugin?.stop(ctx)
    plugin = null

    expect(index?.closed).toBe(true)
    expect(search.index).toBeNull()
    expect(search.indexer).toBeNull()
    expect(watcher.listeners.size).toBe(0)
  }, 30_000)

  it('stops cleanly when the index never opened at all', async () => {
    const search = build('')
    await plugin?.start(ctx)

    await expect(plugin?.stop(ctx)).resolves.toBeUndefined()
    plugin = null

    expect(watcher.listeners.size).toBe(0)
    await expect(search.whenSettled()).resolves.toBeUndefined()
  })
})
