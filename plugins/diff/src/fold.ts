export type FoldEntry<T> = { kind: 'item'; item: T; index: number } | { kind: 'fold'; id: string; start: number; count: number }

export interface FoldOptions {
  context: number
  expanded: ReadonlySet<string>
  // Prefixes the fold id, so two folded lists on one page (a container's children, a sheet's rows) never collide.
  scope: string
}

// Runs of unchanged items keep `context` items next to every change; the rest of a run is one fold entry, whose
// id is `${scope}:${start}` so an expansion survives a re-render. A fold that would hide a single item costs as
// much room as the item, so that item is simply shown. Input with no change at all is returned whole — the view
// shows its empty state there, not one fold over everything.
export function foldRuns<T>(items: readonly T[], isChange: (item: T) => boolean, options: FoldOptions): FoldEntry<T>[] {
  const changed = items.map(isChange)
  const out: FoldEntry<T>[] = []
  const show = (index: number): void => {
    out.push({ kind: 'item', item: items[index], index })
  }
  if (!changed.includes(true)) {
    for (let index = 0; index < items.length; index++) show(index)
    return out
  }
  const context = Math.max(0, Math.floor(options.context))
  let i = 0
  while (i < items.length) {
    if (changed[i]) {
      show(i)
      i++
      continue
    }
    const start = i
    while (i < items.length && !changed[i]) i++
    const end = i
    const keepHead = start === 0 ? 0 : context
    const keepTail = end === items.length ? 0 : context
    const hideFrom = start + keepHead
    const hideTo = end - keepTail
    const id = `${options.scope}:${hideFrom}`
    if (hideTo - hideFrom < 2 || options.expanded.has(id)) {
      for (let k = start; k < end; k++) show(k)
      continue
    }
    for (let k = start; k < hideFrom; k++) show(k)
    out.push({ kind: 'fold', id, start: hideFrom, count: hideTo - hideFrom })
    for (let k = hideTo; k < end; k++) show(k)
  }
  return out
}
