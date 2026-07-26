import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openSqlIndex } from '../pglite-index'
import { searchDocuments } from '../search'
import { parseSearchQuery } from '../search-query'
import type { SqlIndex } from '../types'

// The base the acceptance criterion names (SM-43). Big enough that a plan over an unindexed column would
// show up, small enough to seed in about a second.
const DOCUMENTS = 5000
const BLOCKS_PER_DOCUMENT = 3
const WORDS_PER_BLOCK = 20
const BUDGET_MS = 300

// A word present in a third of the base: a term that matches everything measures the page, and a term
// that matches nothing measures the index lookup and nothing else.
const NEEDLE = 'барабанщик'

const FILLER = ['альфа', 'бета', 'гамма', 'дельта', 'эпсилон', 'zeta', 'eta', 'theta', 'iota', 'kappa']

let index: SqlIndex

// Rows per INSERT. The seeding writes the tables directly rather than going through `writeDocument`:
// five round trips per document would make the fixture minutes long, and what is being measured is the
// search, not the walk.
const CHUNK = 100

async function seed(): Promise<void> {
  await index.transaction(async (tx) => {
    for (let start = 0; start < DOCUMENTS; start += CHUNK) {
      const documents: unknown[] = []
      const blocks: unknown[] = []
      const documentRows: string[] = []
      const blockRows: string[] = []

      for (let n = start; n < start + CHUNK && n < DOCUMENTS; n++) {
        const dir = `notes/f${Math.floor(n / 100)}`
        const path = `${dir}/doc-${n}.md`
        const title = `Документ номер ${n}`
        const words: string[] = []
        for (let w = 0; w < BLOCKS_PER_DOCUMENT * WORDS_PER_BLOCK; w++) {
          words.push(`${FILLER[(n * 7 + w * 3) % FILLER.length]}${w % 5}`)
        }
        if (n % 3 === 0) words[words.length - 1] = NEEDLE

        documentRows.push(placeholders(documents.length, 11))
        documents.push(path, `doc-${n}.md`, dir, 'md', 'markdown', title, title.toLowerCase(), words.join(' '), words.join(' ').length, n, n)

        for (let b = 0; b < BLOCKS_PER_DOCUMENT; b++) {
          blockRows.push(placeholders(blocks.length, 5))
          blocks.push(`${path}#${b}`, path, b, 'paragraph', words.slice(b * WORDS_PER_BLOCK, (b + 1) * WORDS_PER_BLOCK).join(' '))
        }
      }

      await tx.query(
        `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, size, mtime, ctime)
         VALUES ${documentRows.join(', ')}`,
        documents,
      )
      await tx.query(`INSERT INTO block (id, doc_path, ordinal, type, content) VALUES ${blockRows.join(', ')}`, blocks)
    }
  })
}

function placeholders(offset: number, columns: number): string {
  const group: string[] = []
  for (let column = 0; column < columns; column++) group.push(`$${offset + column + 1}`)
  return `(${group.join(', ')})`
}

beforeAll(async () => {
  index = await openSqlIndex({ dataDir: 'memory://' })
  await seed()
}, 120_000)

afterAll(async () => {
  await index.close()
})

describe('searchDocuments on a base of 5000 documents', () => {
  it(`answers a word search within ${BUDGET_MS} ms`, async () => {
    const parsed = parseSearchQuery(`${NEEDLE} `)
    const timings: number[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      const started = performance.now()
      const result = await searchDocuments(index, parsed, { limit: 50 })
      timings.push(performance.now() - started)
      expect(result.documents).toHaveLength(50)
      expect(result.totalCount).toBe(Math.ceil(DOCUMENTS / 3))
      expect(result.hasMore).toBe(true)
    }
    // Reported so a regression shows the real number and not only the verdict.
    console.log(`search over ${DOCUMENTS} documents: ${timings.map((ms) => Math.round(ms)).join(' / ')} ms`)
    for (const elapsed of timings) expect(elapsed).toBeLessThan(BUDGET_MS)
  }, 60_000)

  it(`answers a search while the last word is still being typed within ${BUDGET_MS} ms`, async () => {
    const parsed = parseSearchQuery(NEEDLE.slice(0, 6))
    const started = performance.now()
    const result = await searchDocuments(index, parsed, { limit: 50 })
    const elapsed = performance.now() - started
    console.log(`prefix search over ${DOCUMENTS} documents: ${Math.round(elapsed)} ms`)
    expect(result.documents).toHaveLength(50)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  }, 60_000)
})
