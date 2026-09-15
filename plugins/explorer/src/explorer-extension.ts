import { Extension, type ExtensionArgs } from '@arxhub/core'
import { basename, dirname, extname, join } from '@arxhub/path'
import type { ActionItem } from '@arxhub/uikit/core'
import { type VirtualEntry, type VirtualFileSystem, renameEntry as vfsRenameEntry } from '@arxhub/vfs'
import { ref, type ShallowRef, type WatchStopHandle, watch } from 'vue'

export interface TreeNode {
  entry: VirtualEntry
  children: TreeNode[] | null
  expanded: boolean
  // Set when this node stands for something this device has not fetched — a file left in the cloud
  // (F-06), or a directory that holds nothing else (every one of its descendants is pending too, so
  // there is no real listing behind it). Absent, never false, for an ordinary disk node.
  pending?: boolean
}

// What the extension needs from sync to draw a pending file where it would sit on disk. Kept as this
// narrow shape rather than a `SyncExtension` import — explorer never imports another plugin's
// internals, and the plugin is the one thing that knows how to read sync's own extension.
export interface PendingSource {
  readonly pending: ShallowRef<ReadonlySet<string>>
}

const NO_PENDING: ReadonlySet<string> = new Set()

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

  registerFileTemplate(template: FileTemplate): void {
    if (this.fileTemplates.value.some((item) => item.extension === template.extension)) return
    this.fileTemplates.value.push(template)
  }

  constructor(args: ExplorerExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
  }

  // Wired by the plugin during configure(), against `SyncExtension.pending` — cross-plugin access
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
    const entries = await this.vfs.list(this.root)
    this.tree.value = mergePendingNodes(reconcile(entries, this.tree.value), this.root, this.currentPending())
    await this.refreshExpanded(this.tree.value)
  }

  async expand(node: TreeNode): Promise<void> {
    // A phantom directory has no real listing behind it — mergePendingNodes already computed its
    // whole subtree when its parent was merged, so there is nothing left to fetch.
    if (node.pending) {
      node.expanded = true
      return
    }
    const entries = await this.vfs.list(node.entry.pathname)
    node.children = mergePendingNodes(reconcile(entries, node.children ?? []), node.entry.pathname, this.currentPending())
    node.expanded = true
    await this.refreshExpanded(node.children)
  }

  private async refreshExpanded(nodes: TreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.pending) continue
      if (node.entry.kind !== 'dir' || !node.expanded) continue
      const entries = await this.vfs.list(node.entry.pathname)
      node.children = mergePendingNodes(reconcile(entries, node.children ?? []), node.entry.pathname, this.currentPending())
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
      const ext = extname(name)
      const stem = ext ? name.slice(0, -ext.length) : name
      let candidate = join(parentPath, name)
      for (let n = 2; await this.vfs.exists(candidate); n++) candidate = join(parentPath, `${stem} ${n}${ext}`)
      const template = this.fileTemplates.value.find((item) => item.extension === ext.toLowerCase())
      await this.vfs.file(candidate).writeText(template ? template.seed() : emptyContentFor(name))
      return candidate
    })
    await this.refreshDir(parentPath)
    return path
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

  // Public because a plugin may write into the vault through the VFS directly (the editor's md → arx
  // conversion writes a file the tree has to show) and the tree does not observe VaultWatcher — it is
  // refreshed by whoever wrote. Refreshing the one directory, not loadRoot(), keeps every other node's
  // expanded state.
  async refreshDir(parentPath: string): Promise<void> {
    const norm = parentPath.replace(/^\/+/, '')
    if (!norm || norm === '.') {
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
