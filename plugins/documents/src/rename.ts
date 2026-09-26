import { validation } from '@arxhub/errors'
import { posix } from '@arxhub/path'

// Where a rename lands. Pure, so the whole rule is a unit test rather than a click on a running app.
//
// A rename is NOT a move: a field labelled with the file's name that silently relocated the file when
// the typed text happened to carry a separator would be the one place in the product where a name and a
// path mean the same thing. The tree moves files; this renames them in place.
//
// posix.* rather than the bare exports: a VFS pathname is always '/'-separated, and the node build of
// @arxhub/path answers '\' on Windows (see packages/path/src/index.node.ts).
export function renameTarget(path: string, name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw validation('A file needs a name')
  if (trimmed === '.' || trimmed === '..') throw validation(`"${trimmed}" is not a name`)
  if (/[/\\]/.test(trimmed)) throw validation('A name cannot hold a slash — rename a file here, move it in the tree')
  const dir = posix.dirname(path)
  // A file at the root of the vault has no directory to re-join, and joining '.' would turn a plain
  // 'note.md' into './note.md' — a different string for the same file, which every path comparison
  // in the workspace would read as a different object.
  return dir === '' || dir === '.' ? trimmed : posix.join(dir, trimmed)
}
