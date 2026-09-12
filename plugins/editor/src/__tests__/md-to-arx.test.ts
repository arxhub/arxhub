import { describe, expect, it } from 'vitest'
import { arxPathFor, isMarkdownPath, markdownToArx } from '../md-to-arx'

interface DocMark {
  type: string
  attrs?: Record<string, unknown>
}

interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: DocMark[]
}

// Every case runs through `markdownToArx`, which `check()`s the document before returning it — a
// conversion that produces something the editor cannot open throws here rather than reaching a file.
function convert(markdown: string): { json: DocNode; warnings: string[] } {
  const { doc, warnings } = markdownToArx(markdown)
  return { json: doc.toJSON() as DocNode, warnings }
}

function blocks(markdown: string): DocNode[] {
  return childrenOf(convert(markdown).json)
}

// Asserts as it reads: a node that should hold content and does not fails here, naming itself, rather
// than further down as "cannot read properties of undefined".
function childrenOf(node: DocNode): DocNode[] {
  expect(node.content, `${node.type} has no content`).toBeDefined()
  return node.content ?? []
}

function typesOf(nodes: DocNode[]): string[] {
  return nodes.map((node) => node.type)
}

describe('md → arx: blocks', () => {
  it('turns headings, paragraphs and rules into their nodes', () => {
    const [heading, paragraph, rule] = blocks('# Title\n\nA line.\n\n---\n')
    expect(heading).toEqual({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] })
    expect(paragraph).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'A line.' }] })
    expect(rule).toEqual({ type: 'horizontal_rule' })
  })

  it('keeps every heading level the schema accepts', () => {
    const levels = blocks('# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f').map((node) => node.attrs?.level)
    expect(levels).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('keeps fenced code verbatim with its language', () => {
    const { json, warnings } = convert('```ts\nconst a = 1\n```\n')
    expect(childrenOf(json)[0]).toEqual({ type: 'code_block', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1' }] })
    expect(warnings).toEqual([])
  })

  it('never emits an empty text node for an empty code fence', () => {
    expect(blocks('```\n```\n')[0]).toEqual({ type: 'code_block', attrs: { language: '' } })
  })

  it('gives an empty file a document rather than nothing', () => {
    expect(blocks('')).toEqual([{ type: 'paragraph' }])
  })

  it('collapses a soft line break to a space instead of a rendered newline', () => {
    expect(childrenOf(blocks('one\ntwo')[0])).toEqual([{ type: 'text', text: 'one two' }])
  })

  it('keeps a hard break as its own node', () => {
    expect(childrenOf(blocks('one  \ntwo')[0])).toEqual([{ type: 'text', text: 'one' }, { type: 'hard_break' }, { type: 'text', text: 'two' }])
  })
})

describe('md → arx: marks', () => {
  it('maps every markdown emphasis onto the mark the schema has for it', () => {
    expect(childrenOf(blocks('**b** *i* `c` ~~s~~ [l](https://x.test "t")')[0])).toEqual([
      { type: 'text', text: 'b', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'i', marks: [{ type: 'em' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'code' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 's', marks: [{ type: 'strike' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'l', marks: [{ type: 'link', attrs: { href: 'https://x.test', title: 't' } }] },
    ])
  })

  it('nests marks rather than losing the outer one', () => {
    const [text] = childrenOf(blocks('**bold *and* more**')[0]).slice(1)
    // Order is ProseMirror's (marks come back ranked by the schema), so the assertion is on the set.
    expect((text.marks ?? []).map((mark) => mark.type).sort()).toEqual(['em', 'strong'])
  })

  it('resolves a reference link against its definition and drops the definition itself', () => {
    const content = blocks('See [here][ref].\n\n[ref]: https://x.test\n')
    expect(content).toHaveLength(1)
    expect(childrenOf(content[0])[1].marks).toEqual([{ type: 'link', attrs: { href: 'https://x.test', title: null } }])
  })

  // CommonMark: a reference with no definition is not a link at all, it is the literal brackets. The
  // conversion must not invent a link out of it — an href of `undefined` would fail `check()`.
  it('leaves an unresolved reference as the literal text CommonMark says it is', () => {
    expect(childrenOf(blocks('See [here][missing].')[0])).toEqual([{ type: 'text', text: 'See [here][missing].' }])
  })

  it('carries an image with its alt and title', () => {
    expect(childrenOf(blocks('![alt](pic.png "t")')[0])).toEqual([{ type: 'image', attrs: { src: 'pic.png', alt: 'alt', title: 't' } }])
  })
})

describe('md → arx: lists', () => {
  it('reads a bullet list as items that each start with a paragraph', () => {
    expect(blocks('- one\n- two')[0]).toEqual({
      type: 'bullet_list',
      content: [
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ],
    })
  })

  it('keeps where an ordered list starts', () => {
    expect(blocks('3. three\n4. four')[0].attrs).toEqual({ order: 3 })
  })

  it('puts a nested list inside the item it hangs off', () => {
    const item = childrenOf(blocks('- one\n  - inner')[0])[0]
    expect(typesOf(childrenOf(item))).toEqual(['paragraph', 'bullet_list'])
  })

  it('gives an item that opens with a nested list the paragraph the schema demands', () => {
    const item = childrenOf(blocks('-   - inner')[0])[0]
    expect(childrenOf(item)[0]).toEqual({ type: 'paragraph' })
    expect(typesOf(childrenOf(item))).toEqual(['paragraph', 'bullet_list'])
  })

  it('reads a task list as tasks carrying their state', () => {
    expect(blocks('- [ ] open\n- [x] done')[0]).toEqual({
      type: 'task_list',
      content: [
        { type: 'task_item', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'open' }] }] },
        { type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] },
      ],
    })
  })

  it('splits a list that mixes tasks and plain items into the runs it really is', () => {
    expect(typesOf(blocks('- [ ] task\n- plain\n- [x] task again'))).toEqual(['task_list', 'bullet_list', 'task_list'])
  })

  it('keeps nested content attached to the task that owns it', () => {
    const { json, warnings } = convert('- [ ] task\n  - nested\n- [ ] after')
    expect(typesOf(childrenOf(json))).toEqual(['task_list'])
    const task = childrenOf(childrenOf(json)[0])[0]
    expect(typesOf(childrenOf(task))).toEqual(['paragraph', 'bullet_list'])
    expect(warnings).toEqual([])
  })
})

describe('md → arx: what the format has no node for', () => {
  it('keeps a GFM table as its own markdown source and warns', () => {
    const { json, warnings } = convert('| a | b |\n| - | - |\n| 1 | 2 |\n')
    const [block] = childrenOf(json)
    expect(block.type).toBe('code_block')
    expect(childrenOf(block)[0].text).toContain('| 1 | 2 |')
    expect(warnings.join(' ')).toContain('tables')
  })

  it('keeps a block of raw HTML rather than dropping it', () => {
    const { json, warnings } = convert('<div class="x">hi</div>\n')
    const [block] = childrenOf(json)
    expect(childrenOf(block)[0].text).toBe('<div class="x">hi</div>')
    expect(warnings.join(' ')).toContain('HTML')
  })

  it('keeps front matter at the top instead of losing the title and tags', () => {
    const { json, warnings } = convert('---\ntitle: Note\ntags: [a, b]\n---\n\n# Body\n')
    const [head, body] = childrenOf(json)
    expect(head).toEqual({ type: 'code_block', attrs: { language: '' }, content: [{ type: 'text', text: 'title: Note\ntags: [a, b]' }] })
    expect(body.type).toBe('heading')
    expect(warnings.join(' ')).toContain('front matter')
  })

  it('treats an unterminated front matter fence as content, not metadata', () => {
    expect(blocks('---\ntitle: Note\n\n# Body\n')[0].type).not.toBe('code_block')
  })
})

describe('md → arx: quotes and callouts', () => {
  it('reads a plain blockquote as a blockquote', () => {
    expect(blocks('> quoted')[0]).toEqual({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
    })
  })

  it('reads a GitHub alert as the callout the schema has', () => {
    expect(blocks('> [!WARNING]\n> Careful.')[0]).toEqual({
      type: 'callout',
      attrs: { type: 'warning' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Careful.' }] }],
    })
  })

  it('reads an alert whose body is a separate paragraph', () => {
    const [callout] = blocks('> [!TIP]\n>\n> Try this.')
    expect(callout.attrs).toEqual({ type: 'success' })
    expect(childrenOf(callout)).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'Try this.' }] }])
  })

  it('leaves a marker it does not know as an ordinary quote', () => {
    expect(blocks('> [!NONSENSE]\n> text')[0].type).toBe('blockquote')
  })
})

describe('md → arx: paths', () => {
  it('recognises the markdown extensions and nothing else', () => {
    expect(['a.md', 'a.MARKDOWN', 'dir/b.mkd'].map(isMarkdownPath)).toEqual([true, true, true])
    expect(['a.arx', 'a.txt', 'md', 'a.md.arx'].map(isMarkdownPath)).toEqual([false, false, false, false])
  })

  it('names the converted file beside the original', () => {
    expect(arxPathFor('notes/todo.md')).toBe('notes/todo.arx')
    expect(arxPathFor('notes/no-extension')).toBe('notes/no-extension.arx')
    expect(arxPathFor('my.notes/todo.md')).toBe('my.notes/todo.arx')
  })
})
