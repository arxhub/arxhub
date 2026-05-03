import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { VirtualEntry, VirtualFileSystem } from '@arxhub/vfs'
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

export class ExplorerExtension extends Extension {
  readonly vfs: VirtualFileSystem
  readonly root: string
  readonly tree = ref<TreeNode[]>([])
  contentGroupId: string | null = null

  constructor(args: ExplorerExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
  }

  async loadRoot(): Promise<void> {
    const entries = await this.vfs.list(this.root)
    this.tree.value = entries.map(toNode)
  }

  async expand(node: TreeNode): Promise<void> {
    const entries = await this.vfs.list(node.entry.pathname)
    node.children = entries.map(toNode)
    node.expanded = true
  }

  collapse(node: TreeNode): void {
    node.expanded = false
  }
}

function toNode(entry: VirtualEntry): TreeNode {
  return { entry, children: null, expanded: false }
}
