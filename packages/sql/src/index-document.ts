import { normalizePath, posix } from '@arxhub/path'
import { DOCUMENT_EXTENSIONS, documentExtension, documentPath, type ParsedDocument } from './document'
import type { SqlExecutor, SqlIndex } from './types'

// Rows written per INSERT. Postgres takes at most 65535 bind parameters per statement, and the widest
// row here binds seven — a document with thousands of blocks stays well inside the limit at this size.
const INSERT_CHUNK = 200

// Writes a parsed document into the index, replacing whatever was there. One transaction for the whole
// record: a document must never be visible with the blocks of its previous version.
export async function indexDocument(index: SqlIndex, doc: ParsedDocument): Promise<void> {
  await index.transaction(async (tx) => {
    await writeDocument(tx, doc)
  })
}

// The same write inside a transaction the caller already owns — a batch of documents shares one.
export async function writeDocument(tx: SqlExecutor, doc: ParsedDocument): Promise<void> {
  await tx.query(
    `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, frontmatter, size, mtime, ctime, hash, indexed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, now())
     ON CONFLICT (path) DO UPDATE SET
       name = excluded.name, dir = excluded.dir, ext = excluded.ext, kind = excluded.kind,
       title = excluded.title, title_fold = excluded.title_fold, content = excluded.content,
       frontmatter = excluded.frontmatter, size = excluded.size, mtime = excluded.mtime,
       ctime = excluded.ctime, hash = excluded.hash, indexed_at = now()`,
    [
      doc.path,
      doc.name,
      doc.dir,
      doc.ext,
      doc.kind,
      doc.title,
      doc.titleFold,
      doc.content,
      // jsonb takes text and casts: passing the object would leave the encoding to the driver, and the
      // column is documented as "the metadata as the format carried it".
      doc.frontmatter == null ? null : JSON.stringify(doc.frontmatter),
      doc.size,
      doc.mtime,
      doc.ctime,
      doc.hash,
    ],
  )

  // Reindexing replaces the parse whole rather than adding to it, so the old rows go first — otherwise
  // a heading the owner deleted would keep matching.
  await tx.query('DELETE FROM block WHERE doc_path = $1', [doc.path])
  await tx.query('DELETE FROM tag WHERE doc_path = $1', [doc.path])
  await tx.query('DELETE FROM ref WHERE src_path = $1', [doc.path])

  for (const chunk of chunks(doc.blocks, INSERT_CHUNK)) {
    await tx.query(
      `INSERT INTO block (id, doc_path, ordinal, type, level, checked, content) VALUES ${placeholders(chunk.length, 7)}`,
      chunk.flatMap((block) => [block.id, doc.path, block.ordinal, block.type, block.level, block.checked, block.content]),
    )
  }

  for (const chunk of chunks(doc.tags, INSERT_CHUNK)) {
    await tx.query(
      `INSERT INTO tag (doc_path, block_id, name, name_fold) VALUES ${placeholders(chunk.length, 4)}`,
      chunk.flatMap((tag) => [doc.path, tag.blockId, tag.name, tag.nameFold]),
    )
  }

  if (doc.refs.length > 0) {
    const resolved = await resolveRefTargets(
      tx,
      doc.dir,
      doc.refs.map((ref) => ref.targetRaw),
    )
    for (const chunk of chunks(doc.refs, INSERT_CHUNK)) {
      await tx.query(
        `INSERT INTO ref (src_path, src_block, target_raw, target_path, kind, label) VALUES ${placeholders(chunk.length, 6)}`,
        chunk.flatMap((ref) => [doc.path, ref.srcBlock, ref.targetRaw, resolved.get(ref.targetRaw) ?? null, ref.kind, ref.label]),
      )
    }
  }
}

// Drops a document from the index. Its blocks, tags and links go with it — every child table references
// `document.path` ON DELETE CASCADE, so there is nothing else to clean up.
export async function removeDocument(index: SqlIndex, path: string): Promise<void> {
  await index.query('DELETE FROM document WHERE path = $1', [documentPath(path)])
}

// Everything indexed below a folder. A folder is not a document, so a folder that was deleted or renamed
// arrives as one change on the folder's own path and `removeDocument` there matches nothing — the notes
// inside it would keep answering searches until the next full walk (FR-225).
export async function removeDocumentsUnder(index: SqlIndex, prefix: string): Promise<number> {
  const path = documentPath(prefix)
  // An empty prefix is every document there is. Emptying the index is `reindex()`'s job and it says so;
  // a change reported on '/' must not do it silently.
  if (path === '') return 0
  // starts_with, not LIKE: a folder name holding '%' or '_' is a name, not a pattern. The trailing
  // separator is what keeps 'notes/archive' from also taking 'notes/archived.md' with it.
  const { rows } = await index.query<{ removed: number }>(
    `WITH removed AS (DELETE FROM document WHERE starts_with(path, $1) RETURNING 1)
     SELECT count(*)::int AS removed FROM removed`,
    [`${path}/`],
  )
  return rows[0]?.removed ?? 0
}

// Which indexed document each link points at. A target that is not in the index resolves to null and
// the link is still stored — a link to a note that does not exist yet is a link, not a mistake (FR-222).
export async function resolveRefTargets(tx: SqlExecutor, srcDir: string, targets: readonly string[]): Promise<Map<string, string>> {
  const candidates = new Map<string, string[]>()
  const lookup = new Set<string>()
  for (const target of targets) {
    if (candidates.has(target)) continue
    const paths = refCandidates(srcDir, target)
    candidates.set(target, paths)
    for (const path of paths) lookup.add(path)
  }
  if (lookup.size === 0) return new Map()

  const existing = new Set<string>()
  for (const chunk of chunks([...lookup], 1000)) {
    const { rows } = await tx.query<{ path: string }>(
      `SELECT path FROM document WHERE path IN (${chunk.map((_, i) => `$${i + 1}`).join(', ')})`,
      chunk,
    )
    for (const row of rows) existing.add(row.path)
  }

  const resolved = new Map<string, string>()
  for (const [target, paths] of candidates) {
    const hit = paths.find((path) => existing.has(path))
    if (hit != null) resolved.set(target, hit)
  }
  return resolved
}

// The paths a link could mean, most specific first: as written next to the document that carries it,
// then from the root of the content store, each with and without a document extension (a wikilink is
// normally written without one).
export function refCandidates(srcDir: string, target: string): string[] {
  const cleaned = cleanTarget(target)
  if (cleaned === '') return []

  const bases: string[] = []
  if (srcDir !== '' && !target.startsWith('/')) bases.push(documentPath(posix.join(srcDir, cleaned)))
  bases.push(documentPath(cleaned))

  const result: string[] = []
  for (const base of bases) {
    // A '..' that climbs past the root of the content store points outside the index.
    if (base === '' || base.startsWith('..')) continue
    push(result, base)
    if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(documentExtension(base))) {
      for (const ext of DOCUMENT_EXTENSIONS) push(result, `${base}.${ext}`)
    }
  }
  return result
}

function cleanTarget(target: string): string {
  const [pathPart] = normalizePath(target.trim()).split('#')
  const withoutQuery = pathPart.split('?')[0]
  // A markdown link may be percent-encoded ('my%20note.md'); the stored path is not.
  try {
    return decodeURIComponent(withoutQuery)
  } catch {
    return withoutQuery
  }
}

function push(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

function placeholders(rows: number, columns: number): string {
  const groups: string[] = []
  for (let row = 0; row < rows; row++) {
    const group: string[] = []
    for (let column = 0; column < columns; column++) group.push(`$${row * columns + column + 1}`)
    groups.push(`(${group.join(', ')})`)
  }
  return groups.join(', ')
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}
