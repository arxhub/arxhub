import { assembleDocument, extractDocument, type ParsedDocument } from '@arxhub/sql'
import { describe, expect, it } from 'vitest'
import { ARX_EXTRACTOR, extractArx } from '../arx-extract'

const encoder = new TextEncoder()

const para = (text: string, attrs?: object) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text }] })
const item = (...content: object[]) => ({ type: 'list_item', content })
const fileOf = (...content: object[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })

// Through the engine's own assembly, so tags, refs, titles and occurrences are what the index would store.
const arxDoc = (path: string, ...content: object[]): Promise<ParsedDocument> =>
  extractDocument(path, encoder.encode(fileOf(...content)), undefined, [ARX_EXTRACTOR])

const shape = (doc: { blocks: readonly { type: string; level: number | null; content: string }[] }) =>
  doc.blocks.map((block) => [block.type, block.level, block.content])

describe('extractArx', () => {
  it('walks the tree into blocks, opening the containers', async () => {
    const doc = await arxDoc(
      'notes/tree.arx',
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Дерево' }] },
      para('Абзац с #тегом'),
      { type: 'bullet_list', content: [item(para('раз')), item(para('два'))] },
      { type: 'code_block', content: [{ type: 'text', text: 'let x = 1' }] },
      { type: 'blockquote', content: [para('цитата')] },
      { type: 'paragraph', content: [{ type: 'text', text: 'сюда', marks: [{ type: 'link', attrs: { href: 'notes/other.md' } }] }] },
    )
    expect(doc.kind).toBe('arx')
    expect(shape(doc)).toEqual([
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

  it('reads a file that is not a tree as text, so it is still findable', async () => {
    const doc = await extractDocument('notes/broken.arx', encoder.encode('{ not json at all'), undefined, [ARX_EXTRACTOR])
    expect(doc.kind).toBe('text')
    expect(shape(doc)).toEqual([['paragraph', null, '{ not json at all']])
    expect(doc.title).toBe('broken')
  })

  it('keeps headings, tasks and links structured inside sections and table cells', async () => {
    const doc = await arxDoc('notes/structured.arx', {
      type: 'section',
      attrs: { title: 'Details' },
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Nested heading' }] },
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [
                {
                  type: 'table_cell',
                  content: [{ type: 'task_list', content: [{ type: 'task_item', attrs: { checked: true }, content: [para('Finished')] }] }],
                },
                {
                  type: 'table_cell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Destination', marks: [{ type: 'link', attrs: { href: '/target.arx#text=Block' } }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(shape(doc)).toEqual([
      ['heading', 2, 'Nested heading'],
      ['task', 1, 'Finished'],
      ['paragraph', null, 'Destination'],
    ])
    expect(doc.blocks[1].checked).toBe(true)
    expect(doc.refs[0].targetRaw).toBe('/target.arx#text=Block')
  })

  it('reads a task_item as a task, with its state and its depth', async () => {
    const doc = await arxDoc('notes/tasks.arx', {
      type: 'task_list',
      content: [
        { type: 'task_item', attrs: { checked: true }, content: [para('сделано')] },
        { type: 'task_item', attrs: { checked: false }, content: [para('нет')] },
        // The schema defaults `checked` to false, so no attribute is an unfinished task.
        { type: 'task_item', content: [para('без атрибута')] },
      ],
    })
    expect(doc.blocks.map((block) => [block.type, block.level, block.checked, block.content])).toEqual([
      ['task', 1, true, 'сделано'],
      ['task', 1, false, 'нет'],
      ['task', 1, false, 'без атрибута'],
    ])
  })

  it('gives a nested bullet list a row per item, one level deeper', async () => {
    const doc = await arxDoc('notes/nested.arx', {
      type: 'bullet_list',
      content: [
        item(para('внешний пункт'), {
          type: 'bullet_list',
          content: [item(para('вложенный пункт'), { type: 'bullet_list', content: [item(para('третий уровень'))] })],
        }),
        item(para('второй внешний')),
      ],
    })
    expect(shape(doc)).toEqual([
      ['list-item', 1, 'внешний пункт'],
      ['list-item', 2, 'вложенный пункт'],
      ['list-item', 3, 'третий уровень'],
      ['list-item', 1, 'второй внешний'],
    ])
  })

  it('reads a nested ordered list the same way', async () => {
    const doc = await arxDoc('notes/ordered.arx', {
      type: 'ordered_list',
      content: [item(para('первый'), { type: 'ordered_list', content: [item(para('первый вложенный'))] }), item(para('второй'))],
    })
    expect(shape(doc)).toEqual([
      ['list-item', 1, 'первый'],
      ['list-item', 2, 'первый вложенный'],
      ['list-item', 1, 'второй'],
    ])
  })

  it('reads a task list nested in a list item, keeping the task apart from its parent', async () => {
    const doc = await arxDoc('notes/mixed.arx', {
      type: 'bullet_list',
      content: [
        item(para('пункт с задачами'), {
          type: 'task_list',
          content: [{ type: 'task_item', attrs: { checked: true }, content: [para('подзадача')] }],
        }),
      ],
    })
    expect(doc.blocks.map((block) => [block.type, block.level, block.checked, block.content])).toEqual([
      ['list-item', 1, null, 'пункт с задачами'],
      ['task', 2, true, 'подзадача'],
    ])
  })

  it('separates the blocks it flattens, so two words never fuse into one token', async () => {
    const doc = await arxDoc(
      'notes/quote.arx',
      { type: 'blockquote', content: [para('первый абзац'), para('второй абзац')] },
      { type: 'callout', content: [{ type: 'bullet_list', content: [item(para('первый абзац пункта'), para('второй абзац пункта'))] }] },
    )
    expect(shape(doc)).toEqual([
      ['quote', null, 'первый абзац второй абзац'],
      ['list-item', 1, 'первый абзац пункта второй абзац пункта'],
    ])
  })

  it('anchors each block to its block-identity id, distinct even for identical text', async () => {
    const doc = await arxDoc('notes/identical.arx', para('Повтор', { arxId: 'aaa' }), para('Повтор', { arxId: 'bbb' }))
    expect(doc.blocks.map((block) => [block.anchorId, block.part, block.occurrence])).toEqual([
      ['aaa', null, 0],
      ['bbb', null, 1],
    ])
  })

  it('has no anchor for a node the identity pass never reached', () => {
    const extraction = extractArx(fileOf(para('без идентификатора')))
    expect(extraction.blocks[0].anchor).toBeUndefined()
  })

  describe('the properties block (A-48)', () => {
    it('produces no block of its own, and does not shift the ordinals of what follows', async () => {
      const doc = await arxDoc(
        'notes/props.arx',
        { type: 'properties', attrs: { tags: ['family'], favorite: true, fields: [] } },
        para('Текст'),
      )
      expect(shape(doc)).toEqual([['paragraph', null, 'Текст']])
      expect(doc.blocks[0].id).toBe('notes/props.arx#0')
    })

    it('reads favorite, subject and property fields onto the document', async () => {
      const doc = await arxDoc('photo.jpg.arx', {
        type: 'properties',
        attrs: { tags: [], favorite: true, fields: [{ key: 'location', value: 'Berlin' }], subject: { path: 'photo.jpg', fileId: 'file-1' } },
      })
      expect(doc.favorite).toBe(true)
      expect(doc.subjectPath).toBe('photo.jpg')
      expect(doc.subjectFileId).toBe('file-1')
      expect(doc.properties).toEqual([{ key: 'location', value: 'Berlin' }])
    })

    it('defaults favorite/subject/properties for a document without one', async () => {
      const doc = await arxDoc('notes/plain.arx', para('Ничего особенного'))
      expect(doc.favorite).toBe(false)
      expect(doc.subjectPath).toBeNull()
      expect(doc.subjectFileId).toBeNull()
      expect(doc.properties).toEqual([])
    })

    it('folds its tags into the document’s tags as metadata, apart from tags written in text', async () => {
      const doc = await arxDoc(
        'notes/tagged.arx',
        { type: 'properties', attrs: { tags: ['work', 'home'], favorite: false, fields: [] } },
        para('Заметка про #проект'),
      )
      expect(doc.tags.map((tag) => tag.name).sort()).toEqual(['home', 'work', 'проект'].sort())
      expect(doc.tags.find((tag) => tag.name === 'work')?.blockId).toBeNull()
      expect(doc.tags.find((tag) => tag.name === 'проект')?.blockId).not.toBeNull()
    })

    it('is only read from the FIRST block — a properties-shaped node elsewhere is not one', async () => {
      const buried = { type: 'properties', attrs: { tags: ['ignored'], favorite: true, fields: [] } }
      const doc = await arxDoc('notes/buried.arx', para('Первый абзац'), buried)
      expect(doc.favorite).toBe(false)
      expect(doc.tags).toEqual([])
    })
  })

  it('assembles into the same record when handed to assembleDocument directly', () => {
    const text = fileOf(para('Один', { arxId: 'x1' }))
    const bytes = encoder.encode(text)
    const doc = assembleDocument('a.arx', 'arx', extractArx(text), bytes)
    expect(doc.kind).toBe('arx')
    expect(doc.content).toBe('Один')
    expect(doc.blocks[0].anchorId).toBe('x1')
  })

  it('declares itself linkable for .arx', () => {
    expect(ARX_EXTRACTOR.extensions).toEqual(['.arx'])
    expect(ARX_EXTRACTOR.linkable).toBe(true)
  })
})
