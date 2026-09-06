import type { BlockType } from './document'
import { stripInlineMarkup } from './markup'

// A block before it gets its ordinal and id. `raw` keeps the markup, because a link is only a link
// while its brackets are there; `content` is what the reader sees, and what search matches.
export interface SourceBlock {
  type: BlockType
  level: number | null
  // Done state of a task; null for every other block type. See ParsedBlock.checked.
  checked: boolean | null
  raw: string
  content: string
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/
const HEADING = /^[ \t]{0,3}(#{1,6})(?=[ \t]|$)[ \t]*(.*?)[ \t]*$/
const THEMATIC_BREAK = /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const QUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])(?:[ \t]+(.*?))?[ \t]*$/
// The state is captured, not just matched away: it is the whole reason a task is its own block type.
// The lookahead lets `- [x]` with nothing after it still be a task rather than a paragraph of brackets.
const TASK_MARKER = /^\[([ xX])\](?=[ \t]|$)[ \t]*/

// Markdown to blocks: a heading line is a heading with its level, a list item is one block per item, a
// fenced run is code, a quoted run is a quote, and anything else separated by a blank line is a
// paragraph. A line-based reader rather than a full markdown parser on purpose — the index needs the
// text a reader sees and its rough shape, not a faithful document tree, and every parser dependency
// would have to run in the browser too.
export function parseMarkdownBlocks(body: string): SourceBlock[] {
  const lines = body.split(/\r?\n/)
  const blocks: SourceBlock[] = []
  // Indent widths of the list items currently open, innermost last — the nesting depth of the next item
  // is how many of these it sits inside. A blank line deliberately does not clear it (a loose list is
  // still one list); any other kind of block does.
  const listIndents: number[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence != null) {
      const marker = fence[1]
      const fenced: string[] = []
      i += 1
      while (i < lines.length && !isClosingFence(lines[i], marker)) {
        fenced.push(lines[i])
        i += 1
      }
      // Past the closing fence, or past the end when the fence was never closed — an unterminated
      // fence takes the rest of the file, which is what a markdown renderer shows too.
      i += 1
      listIndents.length = 0
      const code = fenced.join('\n')
      // Code keeps every character: in code the markers are the content.
      blocks.push({ type: 'code', level: null, checked: null, raw: code, content: code })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading != null) {
      listIndents.length = 0
      const raw = heading[2].replace(/[ \t]+#+[ \t]*$/, '')
      blocks.push({ type: 'heading', level: heading[1].length, checked: null, raw, content: stripInlineMarkup(raw) })
      i += 1
      continue
    }

    if (THEMATIC_BREAK.test(line)) {
      listIndents.length = 0
      i += 1
      continue
    }

    const quote = QUOTE.exec(line)
    if (quote != null) {
      const quoted: string[] = [quote[1]]
      i += 1
      while (i < lines.length) {
        const next = QUOTE.exec(lines[i])
        if (next == null) break
        quoted.push(next[1])
        i += 1
      }
      listIndents.length = 0
      const raw = joinSoftLines(quoted)
      blocks.push({ type: 'quote', level: null, checked: null, raw, content: stripInlineMarkup(raw) })
      continue
    }

    const item = LIST_ITEM.exec(line)
    if (item != null) {
      const text = item[2] ?? ''
      const task = TASK_MARKER.exec(text)
      const parts: string[] = [task == null ? text : text.slice(task[0].length)]
      i += 1
      while (i < lines.length && isLazyContinuation(lines[i])) {
        parts.push(lines[i].trim())
        i += 1
      }
      const raw = joinSoftLines(parts)
      blocks.push({
        type: task == null ? 'list-item' : 'task',
        level: nestingDepth(listIndents, item[1]),
        checked: task == null ? null : task[1].toLowerCase() === 'x',
        raw,
        content: stripInlineMarkup(raw),
      })
      continue
    }

    listIndents.length = 0
    const paragraph: string[] = [line.trim()]
    i += 1
    while (i < lines.length && isLazyContinuation(lines[i])) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    const raw = joinSoftLines(paragraph)
    blocks.push({ type: 'paragraph', level: null, checked: null, raw, content: stripInlineMarkup(raw) })
  }

  return blocks
}

// Depth of a list item from its indentation, tracked as a stack of the widths already open. Markdown
// has no single legal indent unit — two spaces, four, or a tab all nest — so depth is read from what
// this document actually did rather than from a width the parser picked. A ragged indent that matches
// nothing on the stack lands at the level it is closest inside, which is what a renderer shows too.
function nestingDepth(open: number[], indent: string): number {
  // A tab advances to the next multiple of four, which is the width every renderer settles on.
  const width = indent.replace(/\t/g, '    ').length
  while (open.length > 0 && width < open[open.length - 1]) open.pop()
  if (open.length === 0 || width > open[open.length - 1]) open.push(width)
  return open.length
}

// A soft line break renders as a space, so that is what the block text carries.
function joinSoftLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
}

function isClosingFence(line: string, marker: string): boolean {
  const fence = FENCE.exec(line)
  // A longer run of the same character closes a fence; a different character does not.
  return fence != null && fence[1][0] === marker[0] && fence[1].length >= marker.length && fence[2].trim() === ''
}

// A line that continues the block above it: not blank and not the start of another block.
function isLazyContinuation(line: string): boolean {
  if (line.trim() === '') return false
  if (FENCE.test(line)) return false
  if (HEADING.test(line)) return false
  if (THEMATIC_BREAK.test(line)) return false
  if (QUOTE.test(line)) return false
  return !LIST_ITEM.test(line)
}
