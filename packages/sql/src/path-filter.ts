import { posix } from '@arxhub/path'
import { documentPath } from './document'

// The sidecar the VFS used to keep a file's hash in. It is gone (A-45) and a one-time sweep removes the
// old ones, but a store that has not been swept yet still holds them, and none of them is a document.
export const METADATA_FILE_SUFFIX = '.arxmeta'

// What an empty folder is made of: the explorer writes it so a folder with no files still exists. Not a
// document — it has no content and the owner never wrote it.
export const FOLDER_MARKER_FILE = '.keep'

// Finder's per-folder metadata, dropped into any folder macOS ever showed. Binary, not the owner's, and
// it reached the index as a parse failure with a Postgres encoding error on every scan.
export const FINDER_METADATA_FILE = '.DS_Store'

// Whether a file of the content store becomes a document of the index.
export function isIndexablePath(pathname: string, exclude: readonly string[] = []): boolean {
  const path = documentPath(pathname)
  if (path === '') return false
  if (path.endsWith(METADATA_FILE_SUFFIX)) return false
  const name = posix.basename(path)
  if (name === FOLDER_MARKER_FILE || name === FINDER_METADATA_FILE) return false
  return !exclude.some((pattern) => matchesGlob(path, pattern))
}

// A path mask: '*' matches within one segment, '**' across segments, '?' one character. A pattern with
// no separator is also tried against the file name alone, so `exclude = ['*.png']` means what it looks
// like; a pattern ending in '/' excludes a whole folder.
export function matchesGlob(path: string, pattern: string): boolean {
  const trimmed = pattern.trim()
  if (trimmed === '') return false
  const normalized = trimmed.endsWith('/') ? `${trimmed}**` : trimmed
  const regex = globToRegExp(normalized)
  if (regex.test(path)) return true
  return !normalized.includes('/') && regex.test(posix.basename(path))
}

const cache = new Map<string, RegExp>()

function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern)
  if (cached != null) return cached

  let source = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // '**/' also matches zero segments, so 'a/**/b.md' matches 'a/b.md'.
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?'
          i += 3
          continue
        }
        source += '.*'
        i += 2
        continue
      }
      source += '[^/]*'
      i += 1
      continue
    }
    if (ch === '?') {
      source += '[^/]'
      i += 1
      continue
    }
    source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    i += 1
  }

  const regex = new RegExp(`^${source}$`)
  cache.set(pattern, regex)
  return regex
}
