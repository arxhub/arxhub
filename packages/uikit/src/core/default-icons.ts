import { icons } from 'lucide-vue-next'
import { type Component, markRaw } from 'vue'
import type { IconResolver } from './icons'

// lucide's `icons` aggregate is keyed by PascalCase names (RefreshCw, FolderOpen, Columns2,
// ArrowDown01…). Our specs are kebab (`lu:refresh-cw`). kebab→PascalCase is exact, digits included:
// 'arrow-down-0-1' → 'ArrowDown01', 'a-arrow-down' → 'AArrowDown'.
function toPascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const pack = icons as unknown as Record<string, Component>

export const resolveLucideIcon: IconResolver = (name) => {
  const component = pack[toPascalCase(name)]
  return component ? markRaw(component) : undefined
}
