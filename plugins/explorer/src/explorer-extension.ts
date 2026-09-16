import { Extension, type ExtensionArgs } from '@arxhub/core'
import { aggregate } from '@arxhub/errors'
import { basename, dirname, extname, join } from '@arxhub/path'
import type { ActionItem } from '@arxhub/uikit/core'
import { type VfsChange, type VfsChangeSource, type VirtualEntry, type VirtualFileSystem, renameEntry as vfsRenameEntry } from '@arxhub/vfs'
import { ref, type ShallowRef, type WatchStopHandle, watch } from 'vue'
import { freeName } from './free-name'
import { describeImportFailure, type ImportedFile, type ImportSource } from './import-files'

export interface TreeNode {
  entry: VirtualEntry
  children: TreeNode[] | null
  expanded: boolean
  // Set when this node stands for something this device has not fetched — a file left in the cloud
  // (F-06), or a directory that holds nothing else (every one of its descendants is pending too, so
  // there is no real listing behind it). Absent, never false, for an ordinary disk node.
  pending?: boolean
  // Path of this file's `<name>.arx` properties card (A-48), when one sits beside it in the same
  // directory — the card is folded into this row rather than drawn as a row of its own (pairCards).
  propertiesCardPath?: string
}

// What the extension needs from the repository to draw a pending file where it would sit on disk.
// Kept as this narrow shape rather than a `RepositoryExtension` import — explorer never imports
// another plugin's internals, and the plugin is the one thing that knows how to read it.
export interface PendingSource {
  readonly pending: ShallowRef<ReadonlySet<string>>
}

const NO_PENDING: ReadonlySet<string> = new Set()

// OR-03: what a row shows, and the tail it keeps off screen. The answer is the one the whole product
// gives (NotesExtension owns it — its viewer registry is what "known" means), reached through this
// delegate rather than an import, wired by the plugin in configure() exactly like setPendingSource below
// (extensions are the only inter-plugin channel). Kept as this narrow shape for the same reason
// PendingSource is. Asking on every render, never caching, is what keeps a plugin switched off losing
// its claim at once rather than on some later cache invalidation nobody wrote.
export interface DisplayName {
  readonly text: string
  readonly hiddenExtension: string
  fullName(edited: string): string
}

type DisplayNameSource = (pathname: string) => DisplayName

// The name as it is on disk, hiding nothing — what a row shows until the plugin wires the real source,
// and what a directory always shows (a folder has no extension a viewer could claim).
const PLAIN_NAME: DisplayNameSource = (pathname) => ({
  text: basename(pathname) || pathname,
  hiddenExtension: '',
  fullName: (edited) => edited,
})

// Long enough for the write that caused a change to have started its own refresh (that one is a
// microtask behind the notification), short enough that a file landing from sync shows up while the
// owner is still looking at the tree. Same shape as workspace-persistence's own debounce.
const REFRESH_DEBOUNCE_MS = 120

// A directory is created by writing this file inside it (createDir). The file itself is never a row, so
// what changed for the tree is the directory that now holds a new folder.
const KEEP = '.keep'

// The tree's own coordinates for a directory: '' is the root, everything else is slash-free of a leading
// separator. `dirname` answers '.' at the top and the vfs is indifferent to a leading '/', so the two
// spellings of the root have to collapse onto one key or a refresh of it would never match a listing of
// it.
function dirKey(pathname: string): string {
  const norm = pathname.replace(/^\/+/, '')
  return norm === '.' ? '' : norm
}

// A pending path is relevant under `dirPath` when it starts with `dirPath/` — the root is the empty
// prefix, so everything is relevant there.
function pendingPrefixOf(dirPath: string): string {
  const norm = dirPath.replace(/^\/+/, '')
  return norm === '' || norm === '.' ? '' : `${norm}/`
}

// Pure: given the real nodes a listing already produced for `dirPath` and the full pending set, adds a
// phantom node for every pending path this directory does not already hold on disk — a file as a leaf,
// a directory (computed once, eagerly — there is no real listing behind it to fetch lazily) for
// anything with further nesting. A name `nodes` already has wins outright: the real entry is left
// exactly as reconciled, never replaced or duplicated.
export function mergePendingNodes(nodes: TreeNode[], dirPath: string, pendingPaths: ReadonlySet<string>): TreeNode[] {
  const prefix = pendingPrefixOf(dirPath)
  const relevant = [...pendingPaths].filter((path) => path.startsWith(prefix) && path.length > prefix.length)
  if (relevant.length === 0) return nodes

  const realNames = new Set(nodes.map((node) => basename(node.entry.pathname)))
  const bySegment = new Map<string, Set<string>>()
  for (const path of relevant) {
    const rest = path.slice(prefix.length)
    const slash = rest.indexOf('/')
    const segment = slash === -1 ? rest : rest.slice(0, slash)
    if (realNames.has(segment)) continue
    const set = bySegment.get(segment) ?? new Set<string>()
    set.add(path)
    bySegment.set(segment, set)
  }
  if (bySegment.size === 0) return nodes

  const phantoms: TreeNode[] = []
  for (const [segment, paths] of bySegment) {
    const childPath = `${prefix}${segment}`
    if (paths.size === 1 && paths.has(childPath)) {
      phantoms.push({ entry: { kind: 'file', pathname: childPath }, children: null, expanded: false, pending: true })
    } else {
      phantoms.push({
        entry: { kind: 'dir', pathname: childPath },
        children: mergePendingNodes([], childPath, paths),
        expanded: false,
        pending: true,
      })
    }
  }
  return [...nodes, ...phantoms]
}

// Same identity iff the same elements in the same order — the cheap check that lets a real directory
// whose subtree didn't change keep its own node object rather than being rebuilt on every pending-set
// tick.
function sameNodes(a: TreeNode[] | null, b: TreeNode[]): boolean {
  return a != null && a.length === b.length && a.every((node, i) => node === b[i])
}

// Pure: the other half of mergePendingNodes — drops a phantom file whose path left the pending set (it
// was materialized, or the remote deleted it outright) and a phantom directory that pruning leaves with
// nothing under it, recursing into every real directory that is already listed (`children != null` —
// one that has never been expanded has nothing to reconcile; merging it happens when it IS expanded).
// A real node whose own subtree needed no change comes back as the exact object it went in as, so a
// caller can tell "nothing happened here" from "something did" without a deep diff of its own.
export function reconcilePending(nodes: TreeNode[], dirPath: string, pending: ReadonlySet<string>): TreeNode[] {
  const kept: TreeNode[] = []
  for (const node of nodes) {
    if (node.pending) {
      if (node.entry.kind === 'file') {
        if (pending.has(node.entry.pathname)) kept.push(node)
        continue
      }
      const children = reconcilePending(node.children ?? [], node.entry.pathname, pending)
      if (children.length > 0) kept.push(sameNodes(node.children, children) ? node : { ...node, children })
      continue
    }
    if (node.entry.kind === 'dir' && node.children != null) {
      const children = reconcilePending(node.children, node.entry.pathname, pending)
      kept.push(sameNodes(node.children, children) ? node : { ...node, children })
    } else {
      kept.push(node)
    }
  }
  return mergePendingNodes(kept, dirPath, pending)
}

// A-48: a `<name>.arx` properties card sits beside its subject file rather than in front of it in the
// tree. Scoped by directory (never by basename alone), so a flat list spanning several directories is
// still handled correctly even though every real caller only ever hands it one directory's own siblings
// at a time (loadRoot/expand/refreshExpanded). A card whose subject is not among its own siblings is an
// orphan (the subject was renamed or deleted) and stays a visible row of its own, exactly as it is on
// disk — the owner can see and deal with it rather than have it silently vanish.
export function pairCards(nodes: readonly TreeNode[]): TreeNode[] {
  const namesByDir = new Map<string, Set<string>>()
  for (const node of nodes) {
    if (node.entry.kind !== 'file') continue
    const dir = dirname(node.entry.pathname)
    const names = namesByDir.get(dir) ?? new Set<string>()
    names.add(basename(node.entry.pathname))
    namesByDir.set(dir, names)
  }

  const folded = new Set<string>() // full pathnames of cards folded into their subject's row
  for (const node of nodes) {
    if (node.entry.kind !== 'file') continue
    const name = basename(node.entry.pathname)
    if (!name.endsWith('.arx')) continue
    const subjectName = name.slice(0, -'.arx'.length)
    if (subjectName !== '' && namesByDir.get(dirname(node.entry.pathname))?.has(subjectName)) folded.add(node.entry.pathname)
  }
  if (folded.size === 0) return nodes as TreeNode[]

  return nodes
    .filter((node) => node.entry.kind !== 'file' || !folded.has(node.entry.pathname))
    .map((node) => {
      if (node.entry.kind !== 'file') return node
      const cardPath = join(dirname(node.entry.pathname), `${basename(node.entry.pathname)}.arx`)
      return folded.has(cardPath) ? { ...node, propertiesCardPath: cardPath } : node
    })
}

// Other plugins contribute context-menu actions for tree nodes (extension-only inter-plugin
// channel). Called each time a menu opens; return [] to contribute nothing for a node.
export type NodeActionContributor = (node: TreeNode) => ActionItem[]

export interface FileTemplate {
  extension: string
  label: string
  icon: string
  seed(): string
}

type ExplorerExtensionArgs = ExtensionArgs & {
  vfs: VirtualFileSystem
  root: string
}

const EMPTY_ARX = JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } })

// Seed content has to match the extension: an '.arx' reader rejects a bare file, and a markdown note
// seeded with a document tree would open as JSON text.
function emptyContentFor(name: string): string {
  return name.toLowerCase().endsWith('.arx') ? EMPTY_ARX : ''
}

// TODO(multi-vfs): one instance is one VFS root, shown as one "Vault" section in FileTreeView. Several
// VFS connected at once would mean a list of these (or an equivalent per-root state) rendered as
// separate worktree-style sections — needs its own design for where the extra roots come from (config,
// an added folder, a sync remote) before touching this. Not built; tracked here so the assumption is
// visible at the one place it lives.
export class ExplorerExtension extends Extension {
  readonly vfs: VirtualFileSystem
  readonly root: string
  readonly tree = ref<TreeNode[]>([])
  readonly selectedPath = ref<string | null>(null)
  // Path of the node currently being inline-renamed (shared so only one renames at a time).
  readonly renamingPath = ref<string | null>(null)
  // Path of the row holding the tree's roving tabindex — the ARIA treeview keyboard model's one Tab
  // stop. Lives here rather than in a component because the recursive FileTreeNode tree has no other
  // shared channel between a row and its siblings elsewhere in the structure.
  readonly focusedPath = ref<string | null>(null)
  private creation: Promise<unknown> = Promise.resolve()
  private readonly nodeActionContributors: NodeActionContributor[] = []
  readonly fileTemplates = ref<FileTemplate[]>([])
  private pendingSource: PendingSource | null = null
  private displayNames: DisplayNameSource = PLAIN_NAME
  // Directories whose listing a change made stale, each with the tick it was reported at; `listedAt`
  // carries the tick each directory's last listing STARTED at. A write made in the tree refreshes its own
  // directory the moment it lands and the watcher reports that same write — the comparison is what keeps
  // that from being two listings of a directory that is already correct.
  private readonly queuedDirs = new Map<string, number>()
  private readonly listedAt = new Map<string, number>()
  private tick = 0
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  // Wired by the plugin during configure(), against `NotesExtension.displayName` — see the
  // `DisplayNameSource` note above.
  setDisplayNames(source: DisplayNameSource): void {
    this.displayNames = source
  }

  displayName(node: TreeNode): DisplayName {
    return node.entry.kind === 'file' ? this.displayNames(node.entry.pathname) : PLAIN_NAME(node.entry.pathname)
  }

  registerFileTemplate(template: FileTemplate): void {
    if (this.fileTemplates.value.some((item) => item.extension === template.extension)) return
    this.fileTemplates.value.push(template)
  }

  constructor(args: ExplorerExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
  }

  // Wired by the plugin during configure(), against `RepositoryExtension.pending` — cross-plugin access
  // goes through an extension, never a direct import. Returns the watch's stop handle: `Extension` has
  // no stop hook of its own, so the plugin is the one that can dispose it in its own `stop()`.
  setPendingSource(source: PendingSource): WatchStopHandle {
    this.pendingSource = source
    // `pending` is a `ShallowRef` reassigned wholesale on every refresh (never mutated in place), so a
    // plain `watch` on it fires exactly on those refreshes — no `deep` needed.
    return watch(source.pending, (current, previous) => this.onPendingChanged(current, previous))
  }

  private currentPending(): ReadonlySet<string> {
    return this.pendingSource?.pending.value ?? NO_PENDING
  }

  // The tree used to be refreshed by whoever wrote, which held only while the tree was the one writing:
  // a rename from the strip above an open document left the row carrying its old name until a reload.
  // Wired by the plugin in start(), against `VaultWatcher` — the extension has no services of its own.
  // Returns the handle that unsubscribes AND drops whatever is still queued, because `Extension` has no
  // stop hook to do it in.
  watchVault(source: VfsChangeSource): () => void {
    const unsubscribe = source.subscribe((change) => this.onVaultChange(change))
    return () => {
      unsubscribe()
      if (this.refreshTimer != null) clearTimeout(this.refreshTimer)
      this.refreshTimer = null
      this.queuedDirs.clear()
    }
  }

  // A listener runs inside the operation that notified it, often under that path's lock, so nothing here
  // may list a directory on the spot — it records which directories went stale and the timer does the
  // reading. That also coalesces the two reports one write makes on a backend with a native watcher.
  private onVaultChange(change: VfsChange): void {
    this.queueRefresh(change.pathname)
    if (change.from != null) this.queueRefresh(change.from)
    if (this.refreshTimer != null) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.flushRefreshes()
    }, REFRESH_DEBOUNCE_MS)
  }

  private queueRefresh(pathname: string): void {
    const dir = basename(pathname) === KEEP ? dirname(dirname(pathname)) : dirname(pathname)
    this.queuedDirs.set(dirKey(dir), ++this.tick)
  }

  private flushRefreshes(): void {
    const stale = [...this.queuedDirs].filter(([dir, reported]) => (this.listedAt.get(dir) ?? 0) < reported)
    this.queuedDirs.clear()
    const targets = new Set<string>()
    for (const [dir] of stale) {
      const shown = this.shownAncestor(dir)
      if (shown != null) targets.add(shown)
    }
    for (const dir of targets) {
      void this.refreshDir(dir).catch((error) => this.logger.error(`Could not refresh ${dir || '/'} after a change outside the tree`, error))
    }
  }

  // The directory the change actually shows up in: a folder nobody has opened draws none of its
  // contents, so there is nothing to re-read — but a folder the tree does not know yet (a whole branch
  // arriving from sync) has to reach the nearest parent that would draw it.
  private shownAncestor(dir: string): string | null {
    for (let current = dir; current !== ''; current = dirKey(dirname(current))) {
      const node = findNode(this.tree.value, current)
      if (node != null) return node.expanded ? current : null
    }
    return ''
  }

  // Every listing goes through here so the tick it started at is recorded — see `queuedDirs`. Stamped
  // BEFORE the call, because a listing that starts after a change was reported already shows it.
  private async listDir(pathname: string): Promise<VirtualEntry[]> {
    this.listedAt.set(dirKey(pathname), ++this.tick)
    return this.vfs.list(pathname)
  }

  // Re-merges the pending set into the tree that is already there — no VFS call, so a sync round that
  // finishes while nobody is looking updates the tree instantly instead of waiting for the next click.
  // A path that left the set either materialized (its directory is asked to pick up the real entry, once
  // per directory) or was deleted outright (nothing to pick up, and refreshDir finding nothing new is
  // harmless).
  private onPendingChanged(pending: ReadonlySet<string>, previous: ReadonlySet<string> | undefined): void {
    this.tree.value = reconcilePending(this.tree.value, this.root, pending)

    const dirsToRefresh = new Set<string>()
    for (const path of previous ?? NO_PENDING) {
      if (!pending.has(path)) dirsToRefresh.add(dirname(path))
    }
    for (const dir of dirsToRefresh) {
      void this.refreshDir(dir).catch((error) => this.logger.error('Could not refresh after a pending path resolved', error))
    }
  }

  registerNodeActions(contributor: NodeActionContributor): void {
    this.nodeActionContributors.push(contributor)
  }

  getContributedActions(node: TreeNode): ActionItem[] {
    return this.nodeActionContributors.flatMap((contribute) => contribute(node))
  }

  expandedPaths(): string[] {
    const paths: string[] = []
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.expanded) paths.push(node.entry.pathname)
        if (node.children) visit(node.children)
      }
    }
    visit(this.tree.value)
    return paths
  }

  async restoreExpanded(paths: readonly string[]): Promise<void> {
    for (const path of [...paths].sort((a, b) => a.split('/').length - b.split('/').length)) {
      const node = findNode(this.tree.value, path)
      if (node?.entry.kind === 'dir' && !node.expanded) await this.expand(node)
    }
  }

  async loadRoot(): Promise<void> {
    const entries = await this.listDir(this.root)
    this.tree.value = pairCards(mergePendingNodes(reconcile(entries, this.tree.value), this.root, this.currentPending()))
    await this.refreshExpanded(this.tree.value)
  }

  async expand(node: TreeNode): Promise<void> {
    // A phantom directory has no real listing behind it — mergePendingNodes already computed its
    // whole subtree when its parent was merged, so there is nothing left to fetch.
    if (node.pending) {
      node.expanded = true
      return
    }
    const entries = await this.listDir(node.entry.pathname)
    node.children = pairCards(mergePendingNodes(reconcile(entries, node.children ?? []), node.entry.pathname, this.currentPending()))
    node.expanded = true
    await this.refreshExpanded(node.children)
  }

  private async refreshExpanded(nodes: TreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.pending) continue
      if (node.entry.kind !== 'dir' || !node.expanded) continue
      const entries = await this.listDir(node.entry.pathname)
      node.children = pairCards(mergePendingNodes(reconcile(entries, node.children ?? []), node.entry.pathname, this.currentPending()))
      await this.refreshExpanded(node.children)
    }
  }

  collapse(node: TreeNode): void {
    node.expanded = false
  }

  collapseAll(): void {
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        node.expanded = false
        if (node.children) walk(node.children)
      }
    }
    walk(this.tree.value)
  }

  private serializeCreation<T>(run: () => Promise<T>): Promise<T> {
    // HTTP VFS locks are no-ops; serialise local create gestures before choosing a free name.
    const task = this.creation.then(run, run)
    this.creation = task.catch(() => {})
    return task
  }

  async createFile(parentPath: string, name: string): Promise<string> {
    const path = await this.serializeCreation(async () => {
      const free = await freeName(name, (candidate) => this.vfs.exists(join(parentPath, candidate)))
      const candidate = join(parentPath, free)
      const template = this.fileTemplates.value.find((item) => item.extension === extname(free).toLowerCase())
      await this.vfs.file(candidate).writeText(template ? template.seed() : emptyContentFor(free))
      return candidate
    })
    await this.refreshDir(parentPath)
    return path
  }

  // OR-07: a file the owner already has, copied into the vault. Every source is streamed through
  // `VirtualFile.writable()` and never read whole here — a picked file can be a film. (What each
  // backend does inside that stream is its own business: node writes straight to disk, while the http
  // and tauri ones still buffer a whole file before their single write.)
  //
  // One failure does not end the gesture: five files picked at once are five independent copies, and
  // stopping at the second would leave the owner guessing which of the rest landed. What failed is
  // raised at the end instead, as one error naming both halves, so the ONE road a click-started action
  // has to report itself (runAction) carries it.
  async importFiles(parentPath: string, sources: readonly ImportSource[]): Promise<ImportedFile[]> {
    const added: ImportedFile[] = []
    const failed: string[] = []
    const errors: unknown[] = []
    for (const source of sources) {
      try {
        // Inside serializeCreation, so choosing a free name and taking it are one step: two files of
        // one gesture can carry the same name, and a name checked before the previous write landed
        // would be handed out twice.
        const path = await this.serializeCreation(async () => {
          const name = await freeName(source.name, (candidate) => this.vfs.exists(join(parentPath, candidate)))
          const target = join(parentPath, name)
          // pipeTo closes the sink on success and aborts it on failure, so the write lock the stream
          // holds is released either way.
          await source.stream().pipeTo(await this.vfs.file(target).writable())
          return target
        })
        added.push({ name: source.name, path })
      } catch (error) {
        this.logger.error(`Could not add ${source.name} to ${parentPath}`, error)
        failed.push(source.name)
        errors.push(error)
      }
    }
    await this.refreshDir(parentPath)
    if (failed.length > 0) throw aggregate(errors, describeImportFailure(failed, added.length), 'Could not add every file')
    return added
  }

  async createDir(parentPath: string, name: string): Promise<void> {
    await this.serializeCreation(async () => {
      let candidate = join(parentPath, name)
      for (let n = 2; await this.vfs.exists(candidate); n++) candidate = join(parentPath, `${name} ${n}`)
      await this.vfs.file(join(candidate, '.keep')).write(new Uint8Array())
    })
    await this.refreshDir(parentPath)
  }

  async deleteEntry(path: string): Promise<void> {
    await this.vfs.delete(path, { recursive: true, force: true })
    await this.refreshDir(dirname(path))
  }

  async renameEntry(path: string, newName: string): Promise<void> {
    await vfsRenameEntry(this.vfs, path, join(dirname(path), newName))
    await this.refreshDir(dirname(path))
  }

  async moveEntry(srcPath: string, destPath: string): Promise<void> {
    await vfsRenameEntry(this.vfs, srcPath, destPath)
    await this.refreshDir(dirname(srcPath))
    await this.refreshDir(dirname(destPath))
  }

  // Public because a write reaches the tree by two roads: the tree's own actions refresh the directory
  // they touched the moment the write lands, and everything else arrives through VaultWatcher (see
  // watchVault). Refreshing the one directory, not loadRoot(), keeps every other node's expanded state.
  async refreshDir(parentPath: string): Promise<void> {
    const norm = dirKey(parentPath)
    if (!norm) {
      await this.loadRoot()
      return
    }
    const node = findNode(this.tree.value, norm)
    if (node) {
      await this.expand(node)
    } else {
      await this.loadRoot()
    }
  }
}

function toNode(entry: VirtualEntry): TreeNode {
  return { entry, children: null, expanded: false }
}

function reconcile(entries: VirtualEntry[], previous: TreeNode[]): TreeNode[] {
  return entries.filter(isVisible).map((entry) => {
    const existing = previous.find((node) => node.entry.pathname === entry.pathname && node.entry.kind === entry.kind)
    if (existing == null) return toNode(entry)
    existing.entry = entry
    return existing
  })
}

function isVisible(entry: VirtualEntry): boolean {
  return basename(entry.pathname) !== '.keep'
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.entry.pathname === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}
