import { Extension, type ExtensionArgs } from '@arxhub/core'
import { basename, dirname, join } from '@arxhub/path'
import { type VirtualEntry, type VirtualFileSystem, renameEntry as vfsRenameEntry } from '@arxhub/vfs'
import { ref } from 'vue'

export interface TreeNode {
  entry: VirtualEntry
  children: TreeNode[] | null
  expanded: boolean
}

type ExplorerExtensionArgs = ExtensionArgs & {
  vfs: VirtualFileSystem
  root: string
}

const EMPTY_ARX = JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } })

export class ExplorerExtension extends Extension {
  readonly vfs: VirtualFileSystem
  readonly root: string
  readonly tree = ref<TreeNode[]>([])
  readonly selectedPath = ref<string | null>(null)
  contentGroupId: string | null = null

  constructor(args: ExplorerExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
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

  async createFile(parentPath: string, name: string): Promise<void> {
    await this.vfs.file(join(parentPath, name)).writeText(EMPTY_ARX)
    await this.refreshPath(parentPath)
  }

  async createDir(parentPath: string, name: string): Promise<void> {
    await this.vfs.file(join(parentPath, name, '.keep')).write(new Uint8Array())
    await this.refreshPath(parentPath)
  }

  async deleteEntry(path: string): Promise<void> {
    await this.vfs.delete(path, { recursive: true, force: true })
    await this.refreshPath(dirname(path))
  }

  async renameEntry(path: string, newName: string): Promise<void> {
    await vfsRenameEntry(this.vfs, path, join(dirname(path), newName))
    await this.refreshPath(dirname(path))
  }

  async moveEntry(srcPath: string, destPath: string): Promise<void> {
    await vfsRenameEntry(this.vfs, srcPath, destPath)
    await this.refreshPath(dirname(srcPath))
    await this.refreshPath(dirname(destPath))
  }

  private async refreshPath(parentPath: string): Promise<void> {
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
