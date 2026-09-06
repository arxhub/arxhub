import { describe, expect, it } from 'vitest'
import { detectDocumentKind, foldText } from '../document'
import { frontmatterTags, splitFrontmatter } from '../frontmatter'
import { stripInlineMarkup } from '../markup'
import { metadataDocument, parseDocument } from '../parse-document'

const encoder = new TextEncoder()

function bytes(lines: readonly string[]): Uint8Array {
  return encoder.encode(lines.join('\n'))
}

// Written as lines rather than one template literal on purpose: a markdown fixture is full of
// backticks, and escaping every one of them makes the fixture unreadable.
const FENCE = '```'

const FULL_NOTE = [
  '---',
  'title: Пример заметки',
  'tags: [alpha, Beta]',
  '---',
  '',
  '# Другой заголовок',
  '',
  'Абзац с **выделением**, [ссылкой](другая.md) и `кодом`.',
  '',
  '- первый элемент',
  '- второй элемент',
  '',
  `${FENCE}js`,
  'const marker = "**not bold**"',
  FENCE,
  '',
  '> цитата с *разметкой*',
]

describe('detectDocumentKind', () => {
  it('reads the kind from the extension', () => {
    expect(detectDocumentKind('notes/a.md')).toBe('markdown')
    expect(detectDocumentKind('notes/a.MARKDOWN')).toBe('markdown')
    expect(detectDocumentKind('notes/a.arx')).toBe('arx')
    expect(detectDocumentKind('notes/a.txt')).toBe('text')
    expect(detectDocumentKind('notes/a.text')).toBe('text')
    expect(detectDocumentKind('notes/LICENSE')).toBe('text')
    expect(detectDocumentKind('notes/photo.png')).toBe('binary')
  })
})

describe('foldText', () => {
  it('lower-cases and drops the diacritics', () => {
    expect(foldText('Café Ünïcode')).toBe('cafe unicode')
    expect(foldText('ЗАМЕТКА')).toBe('заметка')
  })
})

describe('splitFrontmatter', () => {
  it('takes the metadata block only from the start of the file', () => {
    const { frontmatter, body } = splitFrontmatter(['---', 'title: A', '---', 'body', '---', 'more'].join('\n'))
    expect(frontmatter).toEqual({ title: 'A' })
    expect(body).toBe('body\n---\nmore')
  })

  it('reads an unterminated block as content', () => {
    const text = ['---', 'title: A', 'body'].join('\n')
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text })
  })

  it('reads a block sequence and an inline list the same way', () => {
    expect(frontmatterTags(splitFrontmatter(['---', 'tags:', '  - one', '  - "two"', '---', ''].join('\n')).frontmatter)).toEqual([
      'one',
      'two',
    ])
    expect(frontmatterTags({ tags: '#one two' })).toEqual(['one', 'two'])
  })
})

describe('stripInlineMarkup', () => {
  it('leaves what the reader sees', () => {
    expect(stripInlineMarkup('**bold** and _italic_ and ~~gone~~')).toBe('bold and italic and gone')
    expect(stripInlineMarkup('a [link](to/other.md) and an ![image](pic.png)')).toBe('a link and an image')
    expect(stripInlineMarkup('a [[target|label]] and a [[plain]]')).toBe('a label and a plain')
    expect(stripInlineMarkup('`code span` stays')).toBe('code span stays')
  })

  it('leaves a word with underscores alone', () => {
    expect(stripInlineMarkup('call snake_case_name twice')).toBe('call snake_case_name twice')
  })

  it('leaves an escaped marker as the marker', () => {
    expect(stripInlineMarkup('literal \\*asterisks\\* here')).toBe('literal *asterisks* here')
  })
})

describe('parseDocument — markdown', () => {
  const doc = parseDocument('notes/example.md', bytes(FULL_NOTE), { size: 512, mtime: 111, ctime: 222 })

  it('reads the blocks in order, with the heading level', () => {
    expect(doc.blocks.map((block) => [block.type, block.level])).toEqual([
      ['heading', 1],
      ['paragraph', null],
      ['list-item', 1],
      ['list-item', 1],
      ['code', null],
      ['quote', null],
    ])
    expect(doc.blocks.map((block) => block.ordinal)).toEqual([0, 1, 2, 3, 4, 5])
    expect(doc.blocks[0].id).toBe('notes/example.md#0')
  })

  it('takes the markup out of every block but the code', () => {
    expect(doc.blocks[1].content).toBe('Абзац с выделением, ссылкой и кодом.')
    expect(doc.blocks[2].content).toBe('первый элемент')
    expect(doc.blocks[3].content).toBe('второй элемент')
    expect(doc.blocks[4].content).toBe('const marker = "**not bold**"')
    expect(doc.blocks[5].content).toBe('цитата с разметкой')
  })

  it('takes the title from the metadata, not from the first heading', () => {
    expect(doc.title).toBe('Пример заметки')
    expect(doc.titleFold).toBe('пример заметки')
  })

  it('fills the path fields and the stat fields', () => {
    expect({ path: doc.path, name: doc.name, dir: doc.dir, ext: doc.ext, kind: doc.kind }).toEqual({
      path: 'notes/example.md',
      name: 'example.md',
      dir: 'notes',
      ext: 'md',
      kind: 'markdown',
    })
    expect({ size: doc.size, mtime: doc.mtime, ctime: doc.ctime }).toEqual({ size: 512, mtime: 111, ctime: 222 })
    expect(doc.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('joins the blocks into the searchable text', () => {
    expect(doc.content).toBe(doc.blocks.map((block) => block.content).join('\n'))
    expect(doc.content).toContain('Абзац с выделением')
  })

  it('keeps the metadata for the frontmatter column', () => {
    expect(doc.frontmatter).toEqual({ title: 'Пример заметки', tags: ['alpha', 'Beta'] })
  })

  it('takes the tags from the metadata and from the text', () => {
    const withBodyTag = parseDocument('notes/tagged.md', bytes(['---', 'tags: [alpha]', '---', '', 'Про #Кофе и #work/notes.']))
    expect(withBodyTag.tags).toEqual([
      { name: 'alpha', nameFold: 'alpha', blockId: null },
      { name: 'Кофе', nameFold: 'кофе', blockId: 'notes/tagged.md#0' },
      { name: 'work/notes', nameFold: 'work/notes', blockId: 'notes/tagged.md#0' },
    ])
  })

  it('does not read a tag out of a code block or a link fragment', () => {
    const doc = parseDocument('notes/code.md', bytes(['[anchor](other.md#section)', '', `${FENCE}c`, '#include <stdio.h>', FENCE]))
    expect(doc.tags).toEqual([])
  })

  it('takes the links from the text, external addresses aside', () => {
    const doc = parseDocument(
      'notes/links.md',
      bytes(['See [[target|the target]] and [relative](../other/file.md).', '', 'Not [a site](https://example.com) nor [an anchor](#here).']),
    )
    expect(doc.refs).toEqual([
      { kind: 'wikilink', targetRaw: 'target', label: 'the target', srcBlock: 'notes/links.md#0' },
      { kind: 'markdown', targetRaw: '../other/file.md', label: 'relative', srcBlock: 'notes/links.md#0' },
    ])
  })

  it('keeps one row for the same link written twice', () => {
    const doc = parseDocument('notes/dup.md', bytes(['[[target]] and again [[target]].']))
    expect(doc.refs).toHaveLength(1)
  })
})

describe('parseDocument — lists and tasks', () => {
  function blocks(...lines: string[]) {
    return parseDocument('notes/list.md', bytes(lines)).blocks.map((block) => [block.type, block.level, block.checked, block.content])
  }

  it('tells a task apart from a plain list item, and keeps its state', () => {
    expect(blocks('- [ ] написать', '- [x] прочитать', '- просто пункт')).toEqual([
      ['task', 1, false, 'написать'],
      ['task', 1, true, 'прочитать'],
      ['list-item', 1, null, 'просто пункт'],
    ])
  })

  it('reads an upper-case marker as done', () => {
    expect(blocks('- [X] готово')).toEqual([['task', 1, true, 'готово']])
  })

  it('makes a task of a marker with nothing after it', () => {
    expect(blocks('- [ ]')).toEqual([['task', 1, false, '']])
  })

  it('leaves a bracket that is not a marker in the text', () => {
    expect(blocks('- [позже] зайти', '- [] пусто')).toEqual([
      ['list-item', 1, null, '[позже] зайти'],
      ['list-item', 1, null, '[] пусто'],
    ])
  })

  // The depth comes from what the document itself did, not from a width the parser picked: the same
  // shape indented by two spaces and by a tab has to read the same.
  it('reads nesting depth from the indentation the document uses', () => {
    expect(blocks('- один', '  - два', '    - три', '  - обратно', '- корень')).toEqual([
      ['list-item', 1, null, 'один'],
      ['list-item', 2, null, 'два'],
      ['list-item', 3, null, 'три'],
      ['list-item', 2, null, 'обратно'],
      ['list-item', 1, null, 'корень'],
    ])
    expect(blocks('- один', '\t- два')).toEqual([
      ['list-item', 1, null, 'один'],
      ['list-item', 2, null, 'два'],
    ])
  })

  it('keeps one list across a blank line but not across a paragraph', () => {
    expect(blocks('- один', '', '  - два')).toEqual([
      ['list-item', 1, null, 'один'],
      ['list-item', 2, null, 'два'],
    ])
    // A blank line on both sides — a line pressed straight against a list item is a lazy continuation
    // of that item, which is what the joined text below asserts.
    expect(blocks('  - один', '', 'абзац', '', '  - два')).toEqual([
      ['list-item', 1, null, 'один'],
      ['paragraph', null, null, 'абзац'],
      ['list-item', 1, null, 'два'],
    ])
    expect(blocks('  - один', 'абзац')).toEqual([['list-item', 1, null, 'один абзац']])
  })

  it('nests a task under a list item and an ordered marker like any other', () => {
    expect(blocks('1. шаг', '   - [x] подшаг')).toEqual([
      ['list-item', 1, null, 'шаг'],
      ['task', 2, true, 'подшаг'],
    ])
  })
})

describe('parseDocument — title fallbacks', () => {
  it('falls back to the first heading', () => {
    const doc = parseDocument('notes/example.md', bytes(['Вступление.', '', '## Настоящий заголовок']))
    expect(doc.title).toBe('Настоящий заголовок')
  })

  it('falls back to the file name without the extension', () => {
    const doc = parseDocument('notes/Моя заметка.md', bytes(['Просто абзац без заголовков.']))
    expect(doc.title).toBe('Моя заметка')
  })

  it('is never empty, even for an empty file', () => {
    expect(parseDocument('notes/empty.md', new Uint8Array()).title).toBe('empty')
    expect(parseDocument('.gitignore', new Uint8Array()).title).toBe('.gitignore')
  })
})

describe('parseDocument — text and binary', () => {
  it('reads a text file as one paragraph', () => {
    const doc = parseDocument('notes/plain.txt', bytes(['первая строка', 'вторая строка']))
    expect(doc.kind).toBe('text')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0].type).toBe('paragraph')
    expect(doc.blocks[0].content).toBe('первая строка\nвторая строка')
  })

  it('indexes a binary file by its metadata alone', () => {
    const doc = parseDocument('assets/photo.png', new Uint8Array([137, 80, 78, 71]), { size: 4, mtime: 1, ctime: 1 })
    expect(doc.kind).toBe('binary')
    expect(doc.content).toBe('')
    expect(doc.blocks).toEqual([])
    expect(doc.tags).toEqual([])
    expect(doc.refs).toEqual([])
    expect(doc.title).toBe('photo')
    expect(doc.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('builds a metadata-only record for a file it did not read', () => {
    const doc = metadataDocument('notes/huge.md', { size: 9_000_000, mtime: 5, ctime: 5 })
    expect({ kind: doc.kind, content: doc.content, hash: doc.hash, blocks: doc.blocks.length }).toEqual({
      kind: 'markdown',
      content: '',
      hash: null,
      blocks: 0,
    })
    expect(doc.size).toBe(9_000_000)
  })
})

describe('parseDocument — arx', () => {
  const tree = {
    version: 1,
    doc: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Дерево' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Абзац с #тегом' }] },
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'раз' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'два' }] }] },
          ],
        },
        { type: 'code_block', content: [{ type: 'text', text: 'let x = 1' }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'цитата' }] }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'сюда', marks: [{ type: 'link', attrs: { href: 'notes/other.md' } }] }],
        },
      ],
    },
  }

  it('walks the tree into blocks, opening the containers', () => {
    const doc = parseDocument('notes/tree.arx', encoder.encode(JSON.stringify(tree)))
    expect(doc.kind).toBe('arx')
    expect(doc.blocks.map((block) => [block.type, block.level, block.content])).toEqual([
      ['heading', 2, 'Дерево'],
      ['paragraph', null, 'Абзац с #тегом'],
      ['list-item', 1, 'раз'],
      ['list-item', 1, 'два'],
      ['code', null, 'let x = 1'],
      ['quote', null, 'цитата'],
      ['paragraph', null, 'сюда'],
    ])
    expect(doc.title).toBe('Дерево')
    expect(doc.tags).toEqual([{ name: 'тегом', nameFold: 'тегом', blockId: 'notes/tree.arx#1' }])
    expect(doc.refs).toEqual([{ kind: 'markdown', targetRaw: 'notes/other.md', label: 'сюда', srcBlock: 'notes/tree.arx#6' }])
  })

  it('reads a file that is not a tree as text, so it is still findable', () => {
    const doc = parseDocument('notes/broken.arx', bytes(['{ not json at all']))
    expect(doc.kind).toBe('text')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0].type).toBe('paragraph')
    expect(doc.title).toBe('broken')
  })

  it('reads a task_item as a task, with its state and its depth', () => {
    const withTasks = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'task_list',
            content: [
              { type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'сделано' }] }] },
              { type: 'task_item', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'нет' }] }] },
              // No attrs at all: the editor's schema defaults `checked` to false, so this is unfinished
              // rather than a task with nothing to say about its state.
              { type: 'task_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'без атрибута' }] }] },
              {
                type: 'bullet_list',
                content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'вложенный' }] }] }],
              },
            ],
          },
        ],
      },
    }
    const doc = parseDocument('notes/tasks.arx', encoder.encode(JSON.stringify(withTasks)))
    expect(doc.blocks.map((block) => [block.type, block.level, block.checked, block.content])).toEqual([
      ['task', 1, true, 'сделано'],
      ['task', 1, false, 'нет'],
      ['task', 1, false, 'без атрибута'],
      ['list-item', 2, null, 'вложенный'],
    ])
  })
})
