import { Extension, type ExtensionArgs } from '@arxhub/core'
import { basename, dirname, extname, join } from '@arxhub/path'
import type { ActionItem } from '@arxhub/uikit/core'
import { type VirtualEntry, type VirtualFileSystem, renameEntry as vfsRenameEntry } from '@arxhub/vfs'
import { ref } from 'vue'

export interface TreeNode {
  entry: VirtualEntry
  children: TreeNode[] | null
  expanded: boolean
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

  registerFileTemplate(template: FileTemplate): void {
    if (this.fileTemplates.value.some((item) => item.extension === template.extension)) return
    this.fileTemplates.value.push(template)
  }

  constructor(args: ExplorerExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
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
    this.tree.value = reconcile(entries, this.tree.value)
    await this.refreshExpanded(this.tree.value)
  }

  async expand(node: TreeNode): Promise<void> {
    const entries = await this.vfs.list(node.entry.pathname)
    node.children = reconcile(entries, node.children ?? [])
    node.expanded = true
    await this.refreshExpanded(node.children)
  }

  private async refreshExpanded(nodes: TreeNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.entry.kind !== 'dir' || !node.expanded) continue
      const entries = await this.vfs.list(node.entry.pathname)
      node.children = reconcile(entries, node.children ?? [])
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
