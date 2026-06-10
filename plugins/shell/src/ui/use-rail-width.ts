import { type Ref, ref, watch } from 'vue'

export const RAIL_MIN = 160
export const RAIL_MAX = 480
const RAIL_DEFAULT = 240

// One shared ref per key so every mini-app rail using the same key stays in sync.
const widths = new Map<string, Ref<number>>()

function storageKey(key: string): string {
  return `arxhub.rail.${key}`
}

function load(key: string): number {
  const raw = Number(localStorage.getItem(storageKey(key)))
  return Number.isFinite(raw) && raw > 0 ? Math.max(RAIL_MIN, Math.min(RAIL_MAX, raw)) : RAIL_DEFAULT
}

// Shared, persisted rail width keyed by name. The default key links every mini-app's
// left rail to a single width; pass a distinct key for an independent rail.
export function useRailWidth(key = 'default'): Ref<number> {
  let width = widths.get(key)
  if (!width) {
    width = ref(load(key))
    watch(width, (value) => localStorage.setItem(storageKey(key), String(Math.round(value))))
    widths.set(key, width)
  }
  return width
}
