import type { Blockquote, Code, Definition, Heading, List, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { Node } from 'prosemirror-model'
import { schema } from './editor-schema'

// Why a real parser and not `packages/sql/src/markdown.ts`: that reader is deliberately flat (A-29) and
// exists to feed the index — it stops at "heading, paragraph, item, code, quote". A conversion is the
// opposite job: it runs once, on demand, and is the ONE sanctioned way structure gets out of a markdown
// note, so it has to be faithful to CommonMark + GFM rather than approximately right.
//
// mdast (`mdast-util-from-markdown` + the GFM extension) rather than markdown-it because this is a
// tree-to-tree translation: mdast hands back a tree with the same shape the document schema wants,
// while markdown-it emits a flat token stream whose nesting we would have to rebuild by hand — a
// second place to get list nesting wrong. `unified`/`remark-parse` is the same parser with a plugin
// pipeline on top that we have no use for.

interface Mark {
  type: string
  attrs?: Record<string, unknown>
}

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
  marks?: Mark[]
}

export interface MarkdownConversion {
  /** A document the editor can open — `check()`ed before it is returned. */
  doc: Node
  /** What markdown said that the document format has no way to say. Empty means a clean conversion. */
  warnings: string[]
}

// GitHub alerts (`> [!NOTE]`) and the Obsidian callout spelling of the same idiom map onto the schema's
// own `callout` node. This is the one non-CommonMark construct read here, and it is read from the
// *output* of the parser (a blockquote whose first text starts with the marker) rather than by teaching
// the parser a new syntax — nothing about the grammar changes, only what a plain blockquote means.
const CALLOUT_TYPES: Record<string, string> = {
  note: 'info',
  info: 'info',
  important: 'info',
  abstract: 'info',
  tip: 'success',
  hint: 'success',
  success: 'success',
  done: 'success',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  failure: 'danger',
}

const FRONTMATTER_FENCE = /^---[ \t]*$/

/**
 * Converts a markdown note into a document of the editor's schema (F-04, A-29).
 *
 * Throws when the result is not a document the editor could open — a conversion that writes a file the
 * editor rejects is worse than no conversion, so `check()` runs here rather than at the call site.
 */
export function markdownToArx(markdown: string): MarkdownConversion {
  const warnings: string[] = []
  const warn = (message: string): void => {
    if (!warnings.includes(message)) warnings.push(message)
  }

  const { frontmatter, body } = splitFrontmatter(markdown)
  const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const converter = new Converter(body, tree, warn)

  const content: JsonNode[] = []
  // The metadata block has nowhere to go: the schema has no properties node (A-29 lists them as later
  // work). Kept verbatim as the first code block rather than dropped — a conversion must not be the
  // step that loses the note's title and tags.
  if (frontmatter != null) {
    warn('front matter has no place in the document format yet — kept as a code block at the top')
    content.push(codeBlock(frontmatter))
  }
  content.push(...converter.blocks(tree.children))

  // `doc` is `block+`: an empty markdown file still has to become a document, not nothing.
  if (content.length === 0) content.push({ type: 'paragraph' })

  const doc = schema.nodeFromJSON({ type: 'doc', content })
  doc.check()
  return { doc, warnings }
}

class Converter {
  private readonly definitions = new Map<string, Definition>()

  constructor(
    private readonly source: string,
    tree: Root,
    private readonly warn: (message: string) => void,
  ) {
    collectDefinitions(tree, this.definitions)
  }

  blocks(nodes: readonly RootContent[]): JsonNode[] {
    return nodes.flatMap((node) => this.block(node))
  }

  private block(node: RootContent): JsonNode[] {
    switch (node.type) {
      case 'paragraph':
        return [this.paragraph(node)]
      case 'heading':
        return [this.heading(node)]
      case 'thematicBreak':
        return [{ type: 'horizontal_rule' }]
      case 'code':
        return [this.code(node)]
      case 'blockquote':
        return [this.blockquote(node)]
      case 'list':
        return this.list(node)
      case 'definition':
        // Consumed by the link/image references that point at it; it is not content of its own.
        return []
      case 'table':
        this.warn('tables have no node in the document format — kept as their markdown source in a code block')
        return [codeBlock(this.sourceOf(node) ?? '')]
      case 'html':
        this.warn('raw HTML has no node in the document format — kept as its source in a code block')
        return [codeBlock(this.sourceOf(node) ?? '')]
      case 'footnoteDefinition':
        this.warn('footnotes have no node in the document format — kept as their markdown source in a code block')
        return [codeBlock(this.sourceOf(node) ?? '')]
      default:
        this.warn(`"${node.type}" has no node in the document format — kept as its markdown source in a code block`)
        return [codeBlock(this.sourceOf(node) ?? '')]
    }
  }

  private paragraph(node: Paragraph): JsonNode {
    return paragraphOf(this.inline(node.children, []))
  }

  private heading(node: Heading): JsonNode {
    const content = this.inline(node.children, [])
    const json: JsonNode = { type: 'heading', attrs: { level: node.depth } }
    if (content.length > 0) json.content = content
    return json
  }

  private code(node: Code): JsonNode {
    // `code_block` carries no language attribute, so ```ts loses the `ts`. Adding one is a schema
    // change (it would have to reach the index's own reader in packages/sql/src/arx.ts) and belongs
    // to F-02, not here.
    if (node.lang) this.warn(`the language of a code block ("${node.lang}") is not part of the document format and was dropped`)
    return codeBlock(node.value)
  }

  private blockquote(node: Blockquote): JsonNode {
    const inner = this.blocks(node.children)
    const callout = this.asCallout(inner)
    if (callout != null) return callout
    // `blockquote` is `block+`.
    return { type: 'blockquote', content: inner.length > 0 ? inner : [{ type: 'paragraph' }] }
  }

  private asCallout(inner: JsonNode[]): JsonNode | null {
    const first = inner[0]
    if (first?.type !== 'paragraph') return null
    const lead = first.content?.[0]
    if (lead?.type !== 'text' || lead.marks != null || lead.text == null) return null

    const match = /^\[!([A-Za-z]+)\][ \t]*/.exec(lead.text)
    if (match == null) return null
    const type = CALLOUT_TYPES[match[1].toLowerCase()]
    if (type == null) return null

    const rest = lead.text.slice(match[0].length)
    const head: JsonNode[] = rest === '' ? (first.content ?? []).slice(1) : [{ ...lead, text: rest }, ...(first.content ?? []).slice(1)]
    const body = head.length > 0 ? [paragraphOf(head), ...inner.slice(1)] : inner.slice(1)
    return { type: 'callout', attrs: { type }, content: body.length > 0 ? body : [{ type: 'paragraph' }] }
  }

  // A markdown list is one node; the document format may need several. Task state lives on the item in
  // markdown and on the node type here, so a list that mixes tasks and plain items is emitted as the
  // runs it really is rather than forced into one shape that loses one of them.
  private list(node: List): JsonNode[] {
    const out: JsonNode[] = []
    let run: { task: boolean; items: JsonNode[]; order: number } | null = null
    let ordinal = node.ordered ? (node.start ?? 1) : 1

    const flush = (): void => {
      if (run == null) return
      if (run.items.length > 0) out.push(listNode(run.task, node.ordered === true, run.order, run.items))
      run = null
    }

    for (const item of node.children) {
      const task = item.checked != null
      if (run != null && run.task !== task) flush()
      if (run == null) run = { task, items: [], order: ordinal }

      const inner = this.blocks(item.children)
      ordinal += 1

      if (!task) {
        // `list_item` is `paragraph block*` — a nested list is legal, but only after a paragraph.
        const content = inner.length > 0 ? inner : [{ type: 'paragraph' }]
        if (content[0].type !== 'paragraph') content.unshift({ type: 'paragraph' })
        run.items.push({ type: 'list_item', content })
        continue
      }

      // `task_item` is `paragraph+`: a task cannot hold a nested list, a code block or a quote. Those
      // are hoisted to sit directly after the task list instead of being dropped — the content
      // survives in reading order, the "belongs to this task" relation does not.
      let split = 0
      while (split < inner.length && inner[split].type === 'paragraph') split += 1
      const lead = inner.slice(0, split)
      if (lead.length === 0) lead.push({ type: 'paragraph' })
      run.items.push({ type: 'task_item', attrs: { checked: item.checked === true }, content: lead })

      const hoisted = inner.slice(split)
      if (hoisted.length > 0) {
        this.warn('a task can only hold paragraphs — blocks nested under one were moved out to sit after the task list')
        flush()
        out.push(...hoisted)
      }
    }
    flush()
    return out
  }

  private inline(nodes: readonly PhrasingContent[], marks: Mark[]): JsonNode[] {
    return nodes.flatMap((node) => this.phrasing(node, marks))
  }

  private phrasing(node: PhrasingContent, marks: Mark[]): JsonNode[] {
    switch (node.type) {
      case 'text':
        // A markdown soft break is a space to the reader; ProseMirror renders content pre-wrap, so a
        // newline left in the text would show up as a line break the source never asked for.
        return textNode(node.value.replace(/\r?\n/g, ' '), marks)
      case 'strong':
        return this.inline(node.children, withMark(marks, { type: 'strong' }))
      case 'emphasis':
        return this.inline(node.children, withMark(marks, { type: 'em' }))
      case 'delete':
        return this.inline(node.children, withMark(marks, { type: 'strike' }))
      case 'inlineCode':
        return textNode(node.value, withMark(marks, { type: 'code' }))
      case 'link':
        return this.inline(node.children, withMark(marks, { type: 'link', attrs: { href: node.url, title: node.title ?? null } }))
      case 'image':
        return [imageNode(node.url, node.alt, node.title, marks)]
      case 'break':
        return [{ type: 'hard_break' }]
      case 'linkReference': {
        const definition = this.definitions.get(node.identifier)
        if (definition == null) return this.inline(node.children, marks)
        return this.inline(node.children, withMark(marks, { type: 'link', attrs: { href: definition.url, title: definition.title ?? null } }))
      }
      case 'imageReference': {
        const definition = this.definitions.get(node.identifier)
        if (definition == null) return textNode(node.alt ?? node.label ?? '', marks)
        return [imageNode(definition.url, node.alt, definition.title, marks)]
      }
      case 'footnoteReference':
        this.warn('footnote references have no mark in the document format — kept as their literal text')
        return textNode(`[^${node.label ?? node.identifier}]`, marks)
      case 'html':
        this.warn('raw HTML has no node in the document format — kept as its source in a code block')
        return textNode(node.value, marks)
      default:
        return unhandledInline(node)
    }
  }

  // The markdown a node was written as. Positions are offsets into the body the parser was handed, so
  // this is what keeps a table or a block of HTML verbatim instead of paraphrased.
  private sourceOf(node: RootContent): string | null {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start == null || end == null) return null
    return this.source.slice(start, end)
  }
}

// PhrasingContent is a closed set for the extensions enabled here, so this is unreachable — it exists
// so that a node type mdast gains later is a compile error rather than content dropped at runtime. It
// throws rather than guessing: the conversion is reported as a failure and nothing is written.
function unhandledInline(node: never): never {
  throw new Error(`the conversion has no rule for the markdown construct ${JSON.stringify(node)}`)
}

function listNode(task: boolean, ordered: boolean, order: number, items: JsonNode[]): JsonNode {
  if (task) return { type: 'task_list', content: items }
  if (ordered) return { type: 'ordered_list', attrs: { order }, content: items }
  return { type: 'bullet_list', content: items }
}

function paragraphOf(content: JsonNode[]): JsonNode {
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function codeBlock(value: string): JsonNode {
  return value === '' ? { type: 'code_block' } : { type: 'code_block', content: [{ type: 'text', text: value }] }
}

// ProseMirror rejects an empty text node outright, and markdown produces them readily (an empty
// alt text, a reference that resolved to nothing).
function textNode(text: string, marks: Mark[]): JsonNode[] {
  if (text === '') return []
  return [marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }]
}

function imageNode(src: string, alt: string | null | undefined, title: string | null | undefined, marks: Mark[]): JsonNode {
  const json: JsonNode = { type: 'image', attrs: { src, alt: alt ?? null, title: title ?? null } }
  if (marks.length > 0) json.marks = marks
  return json
}

// Marks nest in markdown and are a flat set here, so the same mark applied twice (`**a *b* a**` around
// a link) must not produce it twice.
function withMark(marks: Mark[], mark: Mark): Mark[] {
  if (marks.some((existing) => existing.type === mark.type)) return marks
  return [...marks, mark]
}

function collectDefinitions(node: Root | RootContent, into: Map<string, Definition>): void {
  if (node.type === 'definition') {
    if (!into.has(node.identifier)) into.set(node.identifier, node)
    return
  }
  if (!('children' in node)) return
  for (const child of node.children) collectDefinitions(child as RootContent, into)
}

// Same rule as the index's own reader (packages/sql/src/frontmatter.ts): a '---' block only counts at
// the very start of the file, and an unterminated one is content rather than a guess at where it ends.
function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0])) return { frontmatter: null, body: text }
  for (let i = 1; i < lines.length; i++) {
    if (!FRONTMATTER_FENCE.test(lines[i])) continue
    return { frontmatter: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n') }
  }
  return { frontmatter: null, body: text }
}

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd']

/** Whether a path is a markdown note the conversion offers itself on. */
export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** The `.arx` a markdown note converts into — beside it, same name. */
export function arxPathFor(path: string): string {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return `${dot > slash ? path.slice(0, dot) : path}.arx`
}
