// What `ts_headline` wraps a match in. Deliberately not markup: the interface splits a snippet into
// segments and renders each as text, so nothing from a document can reach the page as HTML (FR-233).
// STX and ETX are the marks — control characters that prose does not contain, so a snippet can be split
// on them without escaping and without a token a document could spell out by accident.
export const SNIPPET_MATCH_START = '\u0002'
export const SNIPPET_MATCH_END = '\u0003'

export interface SnippetSegment {
  text: string
  // This segment is what the query matched. The interface emphasises it; it never interprets it.
  match: boolean
}

// Splits a snippet into plain and matched segments. Unbalanced marks are read forgivingly — a start
// without an end highlights to the end of the snippet — because a truncated headline must still render.
export function snippetSegments(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let text = ''
  let match = false

  const flush = (): void => {
    if (text !== '') segments.push({ text, match })
    text = ''
  }

  for (const char of snippet) {
    if (char === SNIPPET_MATCH_START) {
      flush()
      match = true
      continue
    }
    if (char === SNIPPET_MATCH_END) {
      flush()
      match = false
      continue
    }
    text += char
  }
  flush()

  return segments
}
