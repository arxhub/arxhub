import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { indexDocument, removeDocument, removeDocumentsUnder } from '../index-document'
import { parseDocument } from '../parse-document'
import { openSqlIndex } from '../pglite-index'
import type { SqlIndex } from '../types'

// A cold PGlite costs about a second, so the whole file shares one index and each test starts from an
// empty set of documents.
let index: SqlIndex

const encoder = new TextEncoder()

function write(path: string, lines: readonly string[]): Promise<void> {
  return indexDocument(index, parseDocument(path, encoder.encode(lines.join('\n')), { size: 100, mtime: 1, ctime: 1 }))
}

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  const result = await index.query<R>(sql, params)
  return result.rows
}

beforeAll(async () => {
  index = await openSqlIndex({ dataDir: 'memory://' })
})

afterAll(async () => {
  await index.close()
})

beforeEach(async () => {
  await index.exec('DELETE FROM document')
})

describe('indexDocument', () => {
  it('writes the document, its blocks in order, its tags and its links', async () => {
    await write('notes/example.md', [
      '---',
      'title: Пример',
      'tags: [alpha]',
      '---',
      '',
      '# Заголовок',
      '',
      'Абзац с #тегом и [[другая заметка]].',
    ])

    expect(
      await rows<{ ordinal: number; type: string; level: number | null; content: string }>(
        'SELECT ordinal, type, level, content FROM block WHERE doc_path = $1 ORDER BY ordinal',
        ['notes/example.md'],
      ),
    ).toEqual([
      { ordinal: 0, type: 'heading', level: 1, content: 'Заголовок' },
      { ordinal: 1, type: 'paragraph', level: null, content: 'Абзац с #тегом и другая заметка.' },
    ])

    expect(await rows<{ name: string; name_fold: string; block_id: string | null }>('SELECT name, name_fold, block_id FROM tag')).toEqual([
      { name: 'alpha', name_fold: 'alpha', block_id: null },
      { name: 'тегом', name_fold: 'тегом', block_id: 'notes/example.md#1' },
    ])

    const [document] = await rows<{ title: string; kind: string; frontmatter: unknown }>('SELECT title, kind, frontmatter FROM document')
    expect(document).toEqual({ title: 'Пример', kind: 'markdown', frontmatter: { title: 'Пример', tags: ['alpha'] } })
  })

  it('writes the .arx block identity and the occurrence of a repeated line', async () => {
    const tree = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { arxId: 'aaa' }, content: [{ type: 'text', text: 'Повтор' }] },
          { type: 'paragraph', attrs: { arxId: 'bbb' }, content: [{ type: 'text', text: 'Повтор' }] },
        ],
      },
    }
    await indexDocument(index, parseDocument('notes/tree.arx', encoder.encode(JSON.stringify(tree)), { size: 10, mtime: 1, ctime: 1 }))

    expect(
      await rows<{ arx_id: string | null; occurrence: number }>('SELECT arx_id, occurrence FROM block WHERE doc_path = $1 ORDER BY ordinal', [
        'notes/tree.arx',
      ]),
    ).toEqual([
      { arx_id: 'aaa', occurrence: 0 },
      { arx_id: 'bbb', occurrence: 1 },
    ])

    // Markdown carries no such identity — only the occurrence is available.
    await write('notes/dup.md', ['Повтор', '', 'Другое', '', 'Повтор'])
    expect(
      await rows<{ arx_id: string | null; occurrence: number }>('SELECT arx_id, occurrence FROM block WHERE doc_path = $1 ORDER BY ordinal', [
        'notes/dup.md',
      ]),
    ).toEqual([
      { arx_id: null, occurrence: 0 },
      { arx_id: null, occurrence: 0 },
      { arx_id: null, occurrence: 1 },
    ])
  })

  it('resolves a link to a document that exists and keeps a link to one that does not', async () => {
    await write('notes/target.md', ['# Цель'])
    await write('notes/source.md', ['Смотри [[target]] и [[ничего такого]].'])

    expect(
      await rows<{ target_raw: string; target_path: string | null }>('SELECT target_raw, target_path FROM ref ORDER BY target_raw'),
    ).toEqual([
      { target_raw: 'target', target_path: 'notes/target.md' },
      { target_raw: 'ничего такого', target_path: null },
    ])
  })

  it('replaces the blocks, tags and links of the previous version whole', async () => {
    await write('notes/example.md', ['# Старое', '', 'Абзац с #старым и [[старая цель]].'])
    await write('notes/example.md', ['# Новое'])

    expect(await rows<{ content: string }>('SELECT content FROM block WHERE doc_path = $1', ['notes/example.md'])).toEqual([
      { content: 'Новое' },
    ])
    expect(await rows('SELECT 1 FROM tag')).toEqual([])
    expect(await rows('SELECT 1 FROM ref')).toEqual([])
    expect(await rows<{ count: number }>('SELECT count(*)::int AS count FROM document')).toEqual([{ count: 1 }])
  })

  it('leaves no orphan block behind', async () => {
    await write('notes/a.md', ['# A', '', 'text'])
    await write('notes/a.md', ['# A again'])
    const [orphans] = await rows<{ orphans: number }>(
      `SELECT count(*)::int AS orphans FROM block b LEFT JOIN document d ON d.path = b.doc_path WHERE d.path IS NULL`,
    )
    expect(orphans.orphans).toBe(0)
  })

  it('writes a binary file with no blocks and no content', async () => {
    await indexDocument(index, parseDocument('assets/photo.png', new Uint8Array([1, 2, 3]), { size: 3, mtime: 1, ctime: 1 }))
    const [document] = await rows<{ kind: string; content: string; blocks: number }>(
      `SELECT kind, content, (SELECT count(*)::int FROM block WHERE doc_path = 'assets/photo.png') AS blocks FROM document`,
    )
    expect(document).toEqual({ kind: 'binary', content: '', blocks: 0 })
  })

  it('fills the generated full-text columns so the document is findable by a word of its text', async () => {
    await write('notes/example.md', ['# Заголовок', '', 'Слово из текста заметки.'])
    const [document] = await rows<{ path: string }>(`SELECT path FROM document WHERE tsv @@ to_tsquery('simple', 'текста')`)
    expect(document.path).toBe('notes/example.md')
    const [block] = await rows<{ ordinal: number }>(`SELECT ordinal FROM block WHERE tsv @@ to_tsquery('simple', 'текста')`)
    expect(block.ordinal).toBe(1)
  })

  // A-48: a properties block writes onto `document` (favorite, subject_*) and into its own `property`
  // table — one row per field, dropped and rewritten whole like `block`/`tag`/`ref` on every reindex.
  it('writes a properties block onto document and into property', async () => {
    const arx = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'properties',
            attrs: {
              tags: [],
              favorite: true,
              fields: [{ key: 'status', value: 'done' }],
              subject: { path: 'photo.jpg', fileId: 'file-1' },
            },
          },
        ],
      },
    }
    await indexDocument(index, parseDocument('photo.jpg.arx', encoder.encode(JSON.stringify(arx)), { size: 10, mtime: 1, ctime: 1 }))

    const [document] = await rows<{ favorite: boolean; subject_path: string | null; subject_file_id: string | null }>(
      'SELECT favorite, subject_path, subject_file_id FROM document WHERE path = $1',
      ['photo.jpg.arx'],
    )
    expect(document).toEqual({ favorite: true, subject_path: 'photo.jpg', subject_file_id: 'file-1' })
    expect(await rows<{ key: string; value: string }>('SELECT key, value FROM property WHERE doc_path = $1', ['photo.jpg.arx'])).toEqual([
      { key: 'status', value: 'done' },
    ])
  })

  it('replaces the property rows of the previous version whole', async () => {
    const withOneField = (value: string) => ({
      version: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'properties', attrs: { tags: [], favorite: false, fields: [{ key: 'k', value }] } }],
      },
    })
    await indexDocument(index, parseDocument('a.arx', encoder.encode(JSON.stringify(withOneField('one'))), { size: 1, mtime: 1, ctime: 1 }))
    await indexDocument(index, parseDocument('a.arx', encoder.encode(JSON.stringify(withOneField('two'))), { size: 1, mtime: 2, ctime: 1 }))

    expect(await rows<{ value: string }>('SELECT value FROM property WHERE doc_path = $1', ['a.arx'])).toEqual([{ value: 'two' }])
  })
})

describe('removeDocument', () => {
  it('takes the blocks, tags and links with it', async () => {
    await write('notes/example.md', ['# Заголовок', '', 'Абзац с #тегом и [[цель]].'])
    await removeDocument(index, 'notes/example.md')

    expect(await rows('SELECT 1 FROM document')).toEqual([])
    expect(await rows('SELECT 1 FROM block')).toEqual([])
    expect(await rows('SELECT 1 FROM tag')).toEqual([])
    expect(await rows('SELECT 1 FROM ref')).toEqual([])
  })

  it('does nothing for a document that is not in the index', async () => {
    await expect(removeDocument(index, 'notes/never.md')).resolves.toBeUndefined()
  })

  it('takes its property rows with it', async () => {
    const arx = {
      version: 1,
      doc: { type: 'doc', content: [{ type: 'properties', attrs: { tags: [], favorite: false, fields: [{ key: 'k', value: 'v' }] } }] },
    }
    await indexDocument(index, parseDocument('a.arx', encoder.encode(JSON.stringify(arx)), { size: 1, mtime: 1, ctime: 1 }))
    await removeDocument(index, 'a.arx')

    expect(await rows('SELECT 1 FROM property')).toEqual([])
  })
})

describe('removeDocumentsUnder', () => {
  async function paths(): Promise<string[]> {
    return (await rows<{ path: string }>('SELECT path FROM document ORDER BY path')).map((row) => row.path)
  }

  it('drops every document below the folder, at any depth', async () => {
    await write('notes/archive/one.md', ['# Один'])
    await write('notes/archive/deep/two.md', ['# Два'])
    await write('notes/keep.md', ['# Оставить'])

    expect(await removeDocumentsUnder(index, 'notes/archive')).toBe(2)
    expect(await paths()).toEqual(['notes/keep.md'])
  })

  it('takes the blocks, tags and links of everything below with it', async () => {
    await write('notes/archive/one.md', ['# Заголовок', '', 'Абзац с #тегом и [[цель]].'])

    await removeDocumentsUnder(index, 'notes/archive')

    expect(await rows('SELECT 1 FROM block')).toEqual([])
    expect(await rows('SELECT 1 FROM tag')).toEqual([])
    expect(await rows('SELECT 1 FROM ref')).toEqual([])
  })

  // The separator is the whole point: 'notes/archive' and 'notes/archived.md' are different entries and
  // deleting the folder must not take the note whose name it is a prefix of.
  it('does not take a sibling whose name starts with the folder name', async () => {
    await write('notes/archive/one.md', ['# Один'])
    await write('notes/archived.md', ['# Архив'])

    expect(await removeDocumentsUnder(index, 'notes/archive')).toBe(1)
    expect(await paths()).toEqual(['notes/archived.md'])
  })

  it('reads the prefix as a name, not as a pattern', async () => {
    await write('100%/one.md', ['# Процент'])
    await write('notes/two.md', ['# Заметка'])

    // Under LIKE, '%' would match every path there is.
    expect(await removeDocumentsUnder(index, '100%')).toBe(1)
    expect(await paths()).toEqual(['notes/two.md'])
  })

  it('leaves the folder marker itself alone — a folder is not a document', async () => {
    await write('notes/archive.md', ['# Как файл'])

    expect(await removeDocumentsUnder(index, 'notes/archive.md')).toBe(0)
    expect(await paths()).toEqual(['notes/archive.md'])
  })

  it('refuses an empty prefix rather than emptying the index', async () => {
    await write('notes/one.md', ['# Один'])

    expect(await removeDocumentsUnder(index, '')).toBe(0)
    expect(await removeDocumentsUnder(index, '/')).toBe(0)
    expect(await paths()).toEqual(['notes/one.md'])
  })
})
