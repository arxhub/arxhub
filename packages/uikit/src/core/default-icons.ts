import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Pencil,
  Rows2,
  Settings,
  Trash2,
  Type,
  X,
} from 'lucide-vue-next'
import { registerIconPack } from './icons'

// Default `lu:` pack — an explicit, tree-shakeable map of the icon names ArxHub uses today.
// Extend or override by calling `registerIconPack('lu', …)` or registering another prefix.
export const lucideIcons = {
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'columns-2': Columns2,
  copy: Copy,
  'file-plus': FilePlus,
  'folder-open': FolderOpen,
  'folder-plus': FolderPlus,
  pencil: Pencil,
  'rows-2': Rows2,
  settings: Settings,
  'trash-2': Trash2,
  type: Type,
  x: X,
}

registerIconPack('lu', lucideIcons)
