import { basename } from '@arxhub/path'
import type { TreeNode } from '../explorer-extension'

const PROSE = new Set(['md', 'markdown', 'txt', 'arx'])
const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'vue', 'json', 'css', 'html', 'sh', 'py', 'rs', 'go', 'toml', 'yml', 'yaml', 'sql'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'])

export function fileIcon(node: TreeNode): string {
  if (node.entry.kind === 'dir') return node.expanded ? 'lu:folder-open' : 'lu:folder'
  if (node.pending) return 'lu:cloud'
  const extension = basename(node.entry.pathname).split('.').pop()?.toLowerCase() ?? ''
  if (PROSE.has(extension)) return 'lu:file-text'
  if (CODE.has(extension)) return 'lu:file-code'
  if (IMAGE.has(extension)) return 'lu:file-image'
  return 'lu:file'
}
