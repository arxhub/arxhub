import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FileStat } from '../document'
import { indexDocument } from '../index-document'
import { parseDocument } from '../parse-document'
import { openSqlIndex } from '../pglite-index'
import { type SearchOptions, type SearchResult, searchDocuments } from '../search'
import { parseSearchQuery } from '../search-query'
import { SNIPPET_MATCH_END, SNIPPET_MATCH_START, snippetSegments } from '../snippet'
import type { SqlIndex } from '../types'

// A cold PGlite costs about a second, so the whole file shares one index and each test starts from an
// empty set of documents.
let index: SqlIndex

const encoder = new TextEncoder()

function write(path: string, lines: readonly string[], stat: Partial<FileStat> = {}): Promise<void> {
  const bytes = encoder.encode(lines.join('\n'))
  return indexDocument(index, parseDocument(path, bytes, { size: bytes.length, mtime: 1, ctime: 1, ...stat }))
}

function search(input: string, options: SearchOptions = {}): Promise<SearchResult> {
  return searchDocuments(index, parseSearchQuery(input), options)
}

function paths(result: SearchResult): string[] {
  return result.documents.map((document) => document.path)
}

function highlighted(result: SearchResult): string[] {
  return result.documents.flatMap((document) =>
    document.snippets.flatMap((snippet) =>
      snippetSegments(snippet.text)
        .filter((segment) => segment.match)
        .map((segment) => segment.text),
    ),
  )
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

describe('searchDocuments', () => {
  it('finds a note by a word of its text and shows where it matched', async () => {
    await write('notes/one.md', ['# Первый документ', '', 'Здесь встречается барабанщик в тексте.'])
    await write('notes/two.md', ['# Второй документ', '', 'Ничего похожего.'])

    const result = await search('барабанщик ')
    expect(paths(result)).toEqual(['notes/one.md'])
    expect(result.totalCount).toBe(1)
    expect(result.hasMore).toBe(false)
    expect(highlighted(result)).toEqual(['барабанщик'])
  })

  it('needs every word, in any order and in any block', async () => {
    await write('notes/a.md', ['# Первый', '', 'сначала бирюза.', '', 'потом карусель.'])
    await write('notes/b.md', ['# Второй', '', 'только карусель.'])

    expect(paths(await search('карусель бирюза '))).toEqual(['notes/a.md'])
  })

  it('finds a Russian and an English note without being told the language', async () => {
    await write('notes/ru.md', ['# Первый', '', 'Слово матрёшка в тексте.'])
    await write('notes/en.md', ['# Second', '', 'The word gearbox in the text.'])

    expect(paths(await search('матрёшка '))).toEqual(['notes/ru.md'])
    expect(paths(await search('gearbox '))).toEqual(['notes/en.md'])
  })

  it('ignores case, and ignores diacritics in the title', async () => {
    await write('notes/case.md', ['# Заголовок', '', 'Ничего особенного.'])
    await write('notes/accents.md', ['# Café', '', 'Ничего особенного.'])

    expect(paths(await search('заголовок '))).toEqual(['notes/case.md'])
    expect(paths(await search('cafe '))).toEqual(['notes/accents.md'])
  })

  it('takes a quoted phrase as words that have to sit next to each other', async () => {
    await write('notes/a.md', ['# Первый', '', 'быстрая лисица прыгает.'])
    await write('notes/b.md', ['# Второй', '', 'лисица тут.', '', 'быстрая там.'])

    expect(paths(await search('"быстрая лисица" '))).toEqual(['notes/a.md'])
  })

  it('excludes with a minus and joins with OR', async () => {
    await write('notes/a.md', ['# Первый', '', 'бирюза и карусель.'])
    await write('notes/b.md', ['# Второй', '', 'только бирюза.'])
    await write('notes/c.md', ['# Третий', '', 'только карусель.'])

    expect(paths(await search('бирюза -карусель '))).toEqual(['notes/b.md'])
    expect(paths(await search('бирюза OR карусель ')).sort()).toEqual(['notes/a.md', 'notes/b.md', 'notes/c.md'])
  })

  it('keeps a document out when an excluded word is only in its title', async () => {
    await write('notes/a.md', ['# Карусель', '', 'бирюза внутри.'])
    await write('notes/b.md', ['# Второй', '', 'бирюза внутри.'])

    expect(paths(await search('бирюза -карусель '))).toEqual(['notes/b.md'])
  })

  describe('qualifiers', () => {
    beforeEach(async () => {
      await write('notes/reports/annual.md', ['---', 'title: Годовой отчёт', 'tags: [работа, итоги]', '---', '', 'Текст про бирюзу.'])
      await write('notes/reports/2026/q1.md', ['---', 'title: Отчёт за квартал', 'tags: [работа]', '---', '', 'Текст про бирюзу.'])
      await write('archive/old.txt', ['Просто текст про бирюзу.'])
    })

    it('narrows by title, and narrows further when written twice', async () => {
      expect(paths(await search('бирюзу title:отчёт ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
      expect(paths(await search('бирюзу title:отчёт title:квартал '))).toEqual(['notes/reports/2026/q1.md'])
    })

    it('narrows by path', async () => {
      expect(paths(await search('бирюзу path:reports ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
      expect(paths(await search('бирюзу path:reports path:2026 '))).toEqual(['notes/reports/2026/q1.md'])
    })

    it('narrows by tag, and narrows further when written twice', async () => {
      expect(paths(await search('бирюзу tag:работа ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
      expect(paths(await search('бирюзу tag:работа tag:итоги '))).toEqual(['notes/reports/annual.md'])
    })

    it('narrows by extension, however the user wrote it', async () => {
      expect(paths(await search('бирюзу ext:.TXT '))).toEqual(['archive/old.txt'])
      expect(paths(await search('бирюзу ext:md ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
    })

    it('narrows by folder, nested folders included', async () => {
      expect(paths(await search('бирюзу in:notes/reports ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
      expect(paths(await search('бирюзу in:notes/reports/ ')).sort()).toEqual(['notes/reports/2026/q1.md', 'notes/reports/annual.md'])
      expect(paths(await search('бирюзу in:notes/reports/2026 '))).toEqual(['notes/reports/2026/q1.md'])
      expect(paths(await search('бирюзу in:archive '))).toEqual(['archive/old.txt'])
    })

    it('ignores case and diacritics in a title or tag qualifier', async () => {
      await write('notes/cafe.md', ['---', 'title: Café Годовой', 'tags: [Réunion]', '---', '', 'Текст про бирюзу.'])

      expect(paths(await search('бирюзу title:CAFE '))).toEqual(['notes/cafe.md'])
      expect(paths(await search('бирюзу tag:reunion '))).toEqual(['notes/cafe.md'])
    })

    it('answers a query of qualifiers alone', async () => {
      expect(paths(await search('in:notes/reports/2026 '))).toEqual(['notes/reports/2026/q1.md'])
    })

    it('treats a qualifier value as a value, not as SQL and not as a wildcard', async () => {
      await expect(search(`title:"'; DROP TABLE document; --" `)).resolves.toMatchObject({ totalCount: 0 })
      expect(paths(await search('title:% '))).toEqual([])
      const [{ total }] = (await index.query<{ total: number }>('SELECT count(*)::int AS total FROM document')).rows
      expect(total).toBe(3)
    })
  })

  describe('is: and prop: qualifiers (A-48)', () => {
    function arxDoc(path: string, properties: Record<string, unknown>, text: string): Promise<void> {
      const doc = {
        version: 1,
        doc: {
          type: 'doc',
          content: [
            { type: 'properties', attrs: properties },
            { type: 'paragraph', content: [{ type: 'text', text }] },
          ],
        },
      }
      return write(path, [JSON.stringify(doc)])
    }

    beforeEach(async () => {
      await arxDoc(
        'photo.jpg.arx',
        { tags: [], favorite: true, fields: [{ key: 'status', value: 'done' }], subject: { path: 'photo.jpg' } },
        'Бирюза на фото.',
      )
      await arxDoc('plain.arx', { tags: [], favorite: false, fields: [] }, 'Бирюза без свойств.')
    })

    it('narrows by is:favorite', async () => {
      expect(paths(await search('бирюза is:favorite '))).toEqual(['photo.jpg.arx'])
    })

    it('treats an unknown is: value as matching nothing', async () => {
      expect(paths(await search('бирюза is:bogus '))).toEqual([])
    })

    it('narrows by prop:key=value', async () => {
      expect(paths(await search('бирюза prop:status=done '))).toEqual(['photo.jpg.arx'])
      expect(paths(await search('бирюза prop:status=missing '))).toEqual([])
    })

    it('narrows by a bare prop:key — has the field, whatever its value', async () => {
      expect(paths(await search('бирюза prop:status '))).toEqual(['photo.jpg.arx'])
    })
  })

  describe('incomplete input', () => {
    beforeEach(async () => {
      await write('notes/a.md', ['# Первый', '', 'быстрая лисица прыгает.'])
    })

    it('reads an unclosed quote as a phrase and says the query is unfinished', async () => {
      const result = await search('"быстрая лисица')
      expect(paths(result)).toEqual(['notes/a.md'])
      expect(result.warnings).toHaveLength(1)
    })

    it('answers a qualifier with no value with nothing, and says why', async () => {
      const result = await search('title:')
      expect(result.documents).toEqual([])
      expect(result.totalCount).toBe(0)
      expect(result.warnings).toHaveLength(1)
    })

    it('answers an empty query with nothing, and says why', async () => {
      const result = await search('')
      expect(result.documents).toEqual([])
      expect(result.warnings).toHaveLength(1)
    })
  })

  it('ranks a match in the title above a match in the text', async () => {
    await write('notes/a.md', ['# Барабанщик в заголовке', '', 'ничего.'])
    await write('notes/b.md', ['# Совсем другое', '', 'барабанщик в тексте.'])

    expect(paths(await search('барабанщик ', { sort: 'relevance' }))).toEqual(['notes/a.md', 'notes/b.md'])
  })

  it('does not find a word that is only in the text when the scope is titles', async () => {
    await write('notes/a.md', ['# Совсем другое', '', 'барабанщик в тексте.'])
    await write('notes/b.md', ['# Барабанщик в заголовке', '', 'ничего.'])

    expect(paths(await search('барабанщик ', { scope: 'titles' }))).toEqual(['notes/b.md'])
    expect(paths(await search('барабанщик ')).sort()).toEqual(['notes/a.md', 'notes/b.md'])
  })

  it('finds a title through a one-character typo, and stops when the threshold forbids it', async () => {
    await write('notes/a.md', ['# Барабанщик', '', 'ничего похожего.'])

    expect(paths(await search('барабанщин '))).toEqual(['notes/a.md'])
    expect(paths(await search('барабанщин ', { fuzzyThreshold: 1 }))).toEqual([])
    // Turning fuzzy matching off is not turning search off: the exact title still answers.
    expect(paths(await search('барабанщик ', { fuzzyThreshold: 1 }))).toEqual(['notes/a.md'])
  })

  describe('regular expressions', () => {
    beforeEach(async () => {
      await write('notes/a.md', ['# Первый', '', 'бирюза и карусель.'])
      await write('notes/b.md', ['# Второй', '', 'только Карусель.'])
    })

    it('refuses an expression that does not parse, before the DBMS is asked', async () => {
      await expect(search('(незакрытая ', { regex: true })).rejects.toMatchObject({ body: { code: 'SearchRegexInvalidError' } })
      // The refusal left no failed transaction behind.
      expect(paths(await search('бирюза '))).toEqual(['notes/a.md'])
    })

    it('matches with an expression that does parse', async () => {
      expect(paths(await search('карусел[ья] ', { regex: true })).sort()).toEqual(['notes/a.md', 'notes/b.md'])
      expect(paths(await search('карусел[ья] ', { regex: true, caseSensitive: true }))).toEqual(['notes/a.md'])
    })
  })

  it('compares substrings with the case as written when asked', async () => {
    await write('notes/a.md', ['# Первый', '', 'слово Карусель с большой буквы.'])
    await write('notes/b.md', ['# Второй', '', 'слово карусель с маленькой.'])

    expect(paths(await search('Карусель ', { caseSensitive: true }))).toEqual(['notes/a.md'])
    expect(paths(await search('карусель ', { caseSensitive: true }))).toEqual(['notes/b.md'])
  })

  it('gives no more snippets than asked for, in reading order, with the match marked', async () => {
    await write('notes/a.md', [
      '# Документ',
      '',
      'бирюза один.',
      '',
      'бирюза два.',
      '',
      'бирюза три.',
      '',
      'бирюза четыре.',
      '',
      'бирюза пять.',
    ])

    const [document] = (await search('бирюза ', { snippetsPerDocument: 3 })).documents
    expect(document.snippets).toHaveLength(3)
    expect(document.snippets.map((snippet) => snippet.ordinal)).toEqual([1, 2, 3])
    expect(document.snippets.map((snippet) => snippet.blockId)).toEqual(['notes/a.md#1', 'notes/a.md#2', 'notes/a.md#3'])
    for (const snippet of document.snippets) {
      expect(snippet.text).toContain(SNIPPET_MATCH_START)
      expect(snippet.text).toContain(SNIPPET_MATCH_END)
      expect(snippet.text).not.toContain('<b>')
    }
  })

  it('carries the .arx block identity through to the result, so a hit can reopen the exact block', async () => {
    const tree = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { arxId: 'aaa' }, content: [{ type: 'text', text: 'бирюза первая' }] },
          { type: 'paragraph', attrs: { arxId: 'bbb' }, content: [{ type: 'text', text: 'бирюза вторая' }] },
        ],
      },
    }
    await write('notes/tree.arx', [JSON.stringify(tree)])

    const [document] = (await search('бирюза ')).documents
    expect(document.snippets.map((snippet) => snippet.arxId)).toEqual(['aaa', 'bbb'])
    expect(document.snippets.every((snippet) => snippet.occurrence === 0)).toBe(true)
  })

  it('numbers a repeated markdown line, which has no block identity to fall back on', async () => {
    await write('notes/dup.md', ['бирюза раз.', '', 'другое.', '', 'бирюза раз.'])

    const [document] = (await search('бирюза ')).documents
    expect(document.snippets.map((snippet) => snippet.arxId)).toEqual([null, null])
    expect(document.snippets.map((snippet) => snippet.occurrence)).toEqual([0, 1])
  })

  it('gives the opening block, unmarked, to a document that matched only by its title', async () => {
    await write('notes/a.md', ['---', 'title: Барабанщик', '---', '', 'Тело без совпадения.', '', 'Второй абзац.'])

    const [document] = (await search('барабанщик ')).documents
    expect(document.snippets).toHaveLength(1)
    expect(document.snippets[0].ordinal).toBe(0)
    expect(snippetSegments(document.snippets[0].text)).toEqual([{ text: 'Тело без совпадения.', match: false }])
  })

  it('cuts a long unmarked snippet to the word count asked for', async () => {
    const words = Array.from({ length: 40 }, (_, i) => `слово${i}`)
    await write('notes/a.md', ['---', 'title: Барабанщик', '---', '', words.join(' ')])

    const [document] = (await search('барабанщик ', { snippetWords: 5 })).documents
    expect(document.snippets[0].text).toBe('слово0 слово1 слово2 слово3 слово4')
  })

  it('orders by modification time and by title', async () => {
    await write('notes/a.md', ['# Гамма бирюза'], { mtime: 300 })
    await write('notes/b.md', ['# Альфа бирюза'], { mtime: 100 })
    await write('notes/c.md', ['# Бета бирюза'], { mtime: 200 })

    expect(paths(await search('бирюза ', { sort: 'modified' }))).toEqual(['notes/a.md', 'notes/c.md', 'notes/b.md'])
    expect(paths(await search('бирюза ', { sort: 'title' }))).toEqual(['notes/b.md', 'notes/c.md', 'notes/a.md'])
  })

  it('reports the total and whether the page is cut', async () => {
    for (let i = 0; i < 5; i++) await write(`notes/doc-${i}.md`, [`# Документ ${i}`, '', 'бирюза внутри.'])

    const first = await search('бирюза ', { limit: 2, sort: 'title' })
    expect(paths(first)).toEqual(['notes/doc-0.md', 'notes/doc-1.md'])
    expect(first.totalCount).toBe(5)
    expect(first.hasMore).toBe(true)

    const last = await search('бирюза ', { limit: 2, offset: 4, sort: 'title' })
    expect(paths(last)).toEqual(['notes/doc-4.md'])
    expect(last.totalCount).toBe(5)
    expect(last.hasMore).toBe(false)
  })

  it('reports how long it took', async () => {
    await write('notes/a.md', ['# Первый', '', 'бирюза внутри.'])
    expect((await search('бирюза ')).durationMs).toBeGreaterThan(0)
  })
})

describe('snippetSegments', () => {
  it('splits a snippet into text and matches', () => {
    const snippet = `перед ${SNIPPET_MATCH_START}совпадение${SNIPPET_MATCH_END} после`
    expect(snippetSegments(snippet)).toEqual([
      { text: 'перед ', match: false },
      { text: 'совпадение', match: true },
      { text: ' после', match: false },
    ])
  })

  it('leaves markup in the text alone — it is text, not markup', () => {
    expect(snippetSegments('<b>жирный</b> & <script>')).toEqual([{ text: '<b>жирный</b> & <script>', match: false }])
  })

  it('reads an unbalanced mark forgivingly', () => {
    expect(snippetSegments(`начало ${SNIPPET_MATCH_START}конец`)).toEqual([
      { text: 'начало ', match: false },
      { text: 'конец', match: true },
    ])
  })

  it('has nothing to say about an empty snippet', () => {
    expect(snippetSegments('')).toEqual([])
  })
})
