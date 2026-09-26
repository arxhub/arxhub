import type { InlineSegment } from './model'
import { diffSequence } from './sequence'

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu

// A decoder that refuses rather than substitutes: a U+FFFD in the middle of a "text" diff would hide that the
// file was never text to begin with.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export function decodeText(bytes: Uint8Array): string | null {
  let text: string
  try {
    text = decoder.decode(bytes)
  } catch {
    return null
  }
  return text.includes('\0') ? null : text
}

type Group = { kind: 'equal'; text: string } | { kind: 'change'; removed: string; added: string }

// Word-level runs inside one changed line or block. The concatenation of the equal + removed segments is the
// before text and equal + added the after text, exactly — the view never has to invent a character.
export function wordDiff(before: string, after: string): InlineSegment[] {
  const a = before.match(TOKEN) ?? []
  const b = after.match(TOKEN) ?? []
  const groups: Group[] = []
  for (const op of diffSequence(a, b)) {
    const last = groups[groups.length - 1]
    if (op.kind === 'equal') {
      if (last?.kind === 'equal') last.text += a[op.a]
      else groups.push({ kind: 'equal', text: a[op.a] })
    } else {
      const change = last?.kind === 'change' ? last : { kind: 'change' as const, removed: '', added: '' }
      if (change !== last) groups.push(change)
      if (op.kind === 'removed') change.removed += a[op.a]
      else change.added += b[op.b]
    }
  }
  return toSegments(absorbSpaces(groups))
}

// A lone space kept "equal" between two edits shreds a rewritten phrase into del/ins/space/del/ins; the reader
// wants the phrase before and the phrase after. The space stays in both texts, so nothing is lost.
function absorbSpaces(groups: Group[]): Group[] {
  const out: Group[] = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const previous = out[out.length - 1]
    const next = groups[i + 1]
    if (group.kind === 'equal' && /^\s+$/.test(group.text) && previous?.kind === 'change' && next?.kind === 'change') {
      previous.removed += group.text + next.removed
      previous.added += group.text + next.added
      i++
      continue
    }
    if (group.kind === 'change' && previous?.kind === 'change') {
      previous.removed += group.removed
      previous.added += group.added
      continue
    }
    out.push({ ...group })
  }
  return out
}

function toSegments(groups: Group[]): InlineSegment[] {
  const out: InlineSegment[] = []
  const push = (kind: InlineSegment['kind'], text: string): void => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last?.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  for (const group of groups) {
    if (group.kind === 'equal') {
      push('equal', group.text)
      continue
    }
    // Whitespace both sides share at the edges of an edit is not part of it: peeling it off keeps the marks
    // tight around the words that actually changed.
    const lead = commonPrefix(group.removed, group.added).match(/^\s*/)?.[0] ?? ''
    const removed = group.removed.slice(lead.length)
    const added = group.added.slice(lead.length)
    const trail = commonSuffix(removed, added).match(/\s*$/)?.[0] ?? ''
    push('equal', lead)
    push('removed', removed.slice(0, removed.length - trail.length))
    push('added', added.slice(0, added.length - trail.length))
    push('equal', trail)
  }
  return out
}

function commonPrefix(x: string, y: string): string {
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return x.slice(0, i)
}

function commonSuffix(x: string, y: string): string {
  let i = 0
  while (i < x.length && i < y.length && x[x.length - 1 - i] === y[y.length - 1 - i]) i++
  return x.slice(x.length - i)
}
