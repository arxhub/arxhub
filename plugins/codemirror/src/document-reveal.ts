// Markdown carries no block identity (A-29), so an anchor built from a search hit can only say WHICH
// occurrence of a repeated line it came from — the same "skip" hint `plugins/editor`'s `revealBlock`
// reads for its own text fallback. Kept pure and in its own module so it is a unit test rather than a
// CodeMirror round trip.

// The start of the `occurrence`-th match of `needle` in `haystack` (0 = first). Case-sensitive first;
// falls back to a case-insensitive scan only when the exact text is nowhere in the document at all — a
// note edited since it was indexed may have changed nothing but capitalisation. Not binding: an
// occurrence that is not there falls back to the first match rather than reporting no place at all,
// the same "not binding" rule `BlockAnchor.skip` documents.
export function findOccurrence(haystack: string, needle: string, occurrence = 0): number {
  if (needle === '') return -1
  const exact = indicesOf(haystack, needle)
  const indices = exact.length > 0 ? exact : indicesOf(haystack.toLowerCase(), needle.toLowerCase())
  if (indices.length === 0) return -1
  return indices[occurrence] ?? indices[0]
}

function indicesOf(haystack: string, needle: string): number[] {
  const indices: number[] = []
  let from = 0
  while (true) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    indices.push(at)
    from = at + 1
  }
  return indices
}
