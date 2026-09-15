import { diff3Merge } from 'node-diff3'

export interface TextMergeResult {
  merged: string
  conflicts: number
}

interface Lines {
  lines: string[]
  trailingNewline: boolean
}

// A trailing newline is not a line: `a\n` is one line that ends properly, `a` is one line that does not,
// and `a\n\n` is one line followed by an empty one. Splitting naively would give the first two a phantom
// empty last line and then merge it as content.
function splitLines(text: string): Lines {
  if (text === '') return { lines: [], trailingNewline: false }
  const trailingNewline = text.endsWith('\n')
  return { lines: (trailingNewline ? text.slice(0, -1) : text).split('\n'), trailingNewline }
}

// A line-based three-way merge (diff3, the same algorithm git's default merge driver runs). Hunks that
// do not overlap merge silently; hunks that do become git-style regions, `<<<<<<< local` / `=======` /
// `>>>>>>> remote`, one region per conflict — exactly as in git, two edits on ADJACENT lines are one
// conflict, because diff3 has no context line between them to anchor on. `\r` is kept as part of the
// line, so a CRLF file passes through as CRLF, markers included. A null base is read as an empty one:
// deciding whether that is acceptable is the caller's (the registration's), not this function's.
export function mergeText(base: string | null, local: string, remote: string): TextMergeResult {
  const b = splitLines(base ?? '')
  const l = splitLines(local)
  const r = splitLines(remote)
  const eol = local.includes('\r\n') || remote.includes('\r\n') ? '\r' : ''

  const out: string[] = []
  let conflicts = 0
  for (const region of diff3Merge(l.lines, b.lines, r.lines, { excludeFalseConflicts: true })) {
    if (region.ok) {
      out.push(...region.ok)
    } else if (region.conflict) {
      conflicts++
      out.push(`<<<<<<< local${eol}`, ...region.conflict.a, `=======${eol}`, ...region.conflict.b, `>>>>>>> remote${eol}`)
    }
  }

  // The trailing newline is merged like any other three-way field: the side that changed it wins.
  const trailingNewline = l.trailingNewline === b.trailingNewline ? r.trailingNewline : l.trailingNewline
  const merged = out.length === 0 ? '' : out.join('\n') + (trailingNewline ? '\n' : '')
  return { merged, conflicts }
}
