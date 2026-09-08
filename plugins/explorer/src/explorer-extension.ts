import { Extension, type ExtensionArgs } from '@arxhub/core'
import { basename, dirname, join } from '@arxhub/path'
import type { ActionItem } from '@arxhub/uikit/core'
import { type VirtualEntry, type VirtualFileSystem, renameEntry as vfsRenameEntry } from '@arxhub/vfs'
import { type Component, ref } from 'vue'

export interface TreeNode {
  entry: VirtualEntry
  children: TreeNode[] | null
  expanded: boolean
}

// Other plugins contribute context-menu actions for tree nodes (extension-only inter-plugin
// channel). Called each time a menu opens; return [] to contribute nothing for a node.
export type NodeActionContributor = (node: TreeNode) => ActionItem[]

// A section of the mobile rail switcher (Files | Tabs | Search), contributed by another plugin the
// same way node actions are — Explorer never imports the contributor. Desktop's rail has no switcher
// at all (it stays the file tree, unchanged) and simply never reads this list; only the mobile-only
// switcher component does, so a contribution here has no effect on desktop.
export interface RailTab {
  id: string
  title: string
  icon: string
  component: Component
}

// The one place this id is spelled out. The explorer no longer registers a mini-app under it — the
// tree became the navigation of the "Notes" type when the frames moved to the type registry (F-14/F-16)
// — and what is left is the name a plugin contributing a rail tab marks its own sidebar item
// absorbedOnMobileBy with (see SidebarItem). It goes together with `registerRailTab`, in F-24.
export const EXPLORER_SIDEBAR_ITEM = 'arxhub.explorer'

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
  private readonly nodeActionContributors: NodeActionContributor[] = []
  private readonly railTabs: RailTab[] = []

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

  // Registration always happens during another plugin's configure(), which finishes for every plugin
  // before any plugin's start() begins and well before the first mount — a plain array observed once
  // at render time is enough, the same way node action contributors need no reactivity either.
  registerRailTab(tab: RailTab): void {
    this.railTabs.push(tab)
  }

  getRailTabs(): RailTab[] {
    return this.railTabs
  }

  async loadRoot(): Promise<void> {
    const entries = await this.vfs.list(this.root)
    this.tree.value = entries.filter(isVisible).map(toNode)
  }

  async expand(node: TreeNode): Promise<void> {
    const entries = await this.vfs.list(node.entry.pathname)
    node.children = entries.filter(isVisible).map(toNode)
    node.expanded = true
  }

  collapse(node: TreeNode): void {
    node.expanded = false
  }

  // Folds every open node back to the top level without discarding their fetched children, so
  // re-expanding any of them is instant rather than a new vfs.list() round trip.
  collapseAll(): void {
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        node.expanded = false
        if (node.children) walk(node.children)
      }
    }
    walk(this.tree.value)
  }

  async createFile(parentPath: string, name: string): Promise<void> {
    await this.vfs.file(join(parentPath, name)).writeText(emptyContentFor(name))
    await this.refreshDir(parentPath)
  }

  async createDir(parentPath: string, name: string): Promise<void> {
    await this.vfs.file(join(parentPath, name, '.keep')).write(new Uint8Array())
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
