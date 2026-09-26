// How many of the strip's optional parts, taken in drop order, must hide for the rest to fit. `parts` are their
// measured widths (meta, summary, layout segment), each costing one `gap` more while it is shown; `fixed` is what
// never hides (name, navigation, «…»). A strip too narrow even for `fixed` hides them all.
export function collapsedCount(available: number, fixed: number, parts: readonly number[], gap: number): number {
  let width = fixed + parts.reduce((sum, part) => sum + part + gap, 0)
  for (let hidden = 0; hidden < parts.length; hidden++) {
    if (width <= available) return hidden
    width -= parts[hidden] + gap
  }
  return parts.length
}
