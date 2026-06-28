import { icons } from 'lucide-vue-next'
import { type Component, markRaw } from 'vue'
import { registerIconPack } from './icons'

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

// Register the WHOLE lucide set lazily under `lu:` — a resolver (not a hand-maintained map) so any
// `lu:<kebab-name>` resolves without us enumerating names. Trade-off: the full icon set is bundled.
// No cache needed: `pack[...]` returns the same component reference every time and markRaw is
// idempotent, so repeated resolves yield the identical object (no remounts) for negligible cost.
registerIconPack('lu', (name: string): Component | undefined => {
  const component = pack[toPascalCase(name)]
  return component ? markRaw(component) : undefined
})
