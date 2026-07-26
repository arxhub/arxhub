export interface FrontmatterSplit {
  frontmatter: Record<string, unknown> | null
  body: string
}

const FENCE = /^---[ \t]*$/

// Splits a leading metadata block off a markdown file. The block is delimited by '---' lines and only
// counts at the very start of the file — a '---' further down is a thematic break, not metadata.
export function splitFrontmatter(text: string): FrontmatterSplit {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || !FENCE.test(lines[0])) return { frontmatter: null, body: text }

  for (let i = 1; i < lines.length; i++) {
    if (!FENCE.test(lines[i])) continue
    return { frontmatter: parseFrontmatter(lines.slice(1, i)), body: lines.slice(i + 1).join('\n') }
  }
  // No closing fence: the file opens with something that looks like metadata and never ends it. Read it
  // as content — guessing where the block stops would silently swallow the document.
  return { frontmatter: null, body: text }
}

// A deliberately small YAML subset: `key: scalar`, `key: [a, b]`, and a `key:` followed by indented
// `- item` lines. Nothing here needs a YAML parser — the index reads `title` and `tags` and hands the
// rest to jsonb as-is — and adding one would put a whole grammar between a note and its title. A shape
// this does not understand comes back as the raw string, so nothing is lost, it is just not structured.
export function parseFrontmatter(lines: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    i += 1
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue

    const match = /^([A-Za-z0-9_.$-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (match == null) continue

    const key = match[1]
    const inline = match[2].trim()
    if (inline !== '') {
      result[key] = parseScalarOrInlineList(inline)
      continue
    }

    // An empty value means either a block sequence on the following lines or genuinely nothing.
    const items: unknown[] = []
    while (i < lines.length) {
      const item = /^[ \t]+-[ \t]+(.*)$/.exec(lines[i]) ?? /^-[ \t]+(.*)$/.exec(lines[i])
      if (item == null) break
      items.push(parseScalar(item[1].trim()))
      i += 1
    }
    result[key] = items.length > 0 ? items : ''
  }

  return result
}

function parseScalarOrInlineList(value: string): unknown {
  if (value.startsWith('[') && value.endsWith(']')) {
    return splitInlineList(value.slice(1, -1)).map(parseScalar)
  }
  return parseScalar(value)
}

// Splits `a, "b, c", d` on the commas that are not inside quotes.
function splitInlineList(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (const ch of value) {
    if (quote != null) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ',') {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current.trim())
  return parts.filter((part) => part !== '')
}

function parseScalar(value: string): unknown {
  const text = stripQuotes(value)
  if (text !== value) return text
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text)
  return text
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}

// The metadata value that names the document, if it is a non-empty string (FR-220).
export function frontmatterTitle(frontmatter: Record<string, unknown> | null): string | null {
  const value = frontmatter?.title
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// Tags declared in the metadata, in declaration order. A single string is accepted as one tag or a
// comma/space separated list, because both are written in practice.
export function frontmatterTags(frontmatter: Record<string, unknown> | null): string[] {
  const value = frontmatter?.tags
  if (value == null) return []
  const raw = Array.isArray(value) ? value : [value]
  const names: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' && typeof entry !== 'number') continue
    for (const part of String(entry).split(/[,\s]+/)) {
      const name = part.trim().replace(/^#/, '')
      if (name !== '') names.push(name)
    }
  }
  return names
}
