import { type Component, markRaw } from 'vue'

// An icon spec is `"<prefix>:<name>"` (FontAwesome-style), e.g. `lu:folder-open`, `fa:trash`.
// A name with no registered prefix is rendered as a raw text/emoji glyph, so `📁` and custom
// glyphs work without registration.

export type IconResolver = (name: string) => Component | undefined

type IconPack = IconResolver | Record<string, Component>

export interface ResolvedIcon {
  component?: Component
  glyph?: string
}

const packs = new Map<string, IconPack>()

export function registerIconPack(prefix: string, pack: IconPack): void {
  if (typeof pack === 'function') {
    packs.set(prefix, pack)
    return
  }
  const frozen: Record<string, Component> = {}
  for (const [name, component] of Object.entries(pack)) frozen[name] = markRaw(component)
  packs.set(prefix, frozen)
}

export function resolveIcon(spec: string): ResolvedIcon {
  const idx = spec.indexOf(':')
  if (idx > 0) {
    const prefix = spec.slice(0, idx)
    const name = spec.slice(idx + 1)
    const pack = packs.get(prefix)
    if (pack) {
      const component = typeof pack === 'function' ? pack(name) : pack[name]
      if (component) return { component }
      // Known prefix but unknown icon: fall back to the bare name as text rather than the spec.
      return { glyph: name }
    }
  }
  // No prefix / unknown prefix → render the raw string (emoji, custom glyph).
  return { glyph: spec }
}
