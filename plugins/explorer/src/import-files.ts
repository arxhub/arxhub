import { posix } from '@arxhub/path'
import { t } from './i18n/messages'

const { basename } = posix

// A file the owner picked outside the vault. The browser's own `File` satisfies this structurally, so
// the import itself never touches the DOM — which is what keeps the picker (ui/pick-files.ts) the only
// part of this road that cannot be tested without one.
//
// `stream()` and not `bytes` deliberately: a picked file can be a film, and a signature that took a
// Uint8Array would put the whole of it in memory before the vault was even asked for a name.
export interface ImportSource {
  readonly name: string
  stream(): ReadableStream<Uint8Array>
}

export interface ImportedFile {
  // What the picker handed over.
  readonly name: string
  // Where it landed — a different basename whenever the name was already taken.
  readonly path: string
}

// Up to three, then a count: the toast is two lines, and ten names in it say less than three plus "and
// 7 more" does.
function listNames(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ')
  return t('imported.more', { names: names.slice(0, 3).join(', '), count: names.length - 3 })
}

// What the success toast says. A rename is the surprising half — nothing was overwritten, but what the
// owner will look for under the name they picked is not there — so when anything was renamed that is
// what the description spends itself on.
export function describeImport(added: readonly ImportedFile[]): { title: string; description: string } {
  const title = t('imported.title', { count: added.length })
  const renamed = added.filter((file) => basename(file.path) !== file.name)
  if (renamed.length === 0) return { title, description: listNames(added.map((file) => file.name)) }
  const pairs = renamed.map((file) => `${file.name} → ${basename(file.path)}`)
  return { title, description: t('imported.renamed', { list: listNames(pairs) }) }
}

// What a partial import tells the error toast. It has to carry both halves: which files did not land,
// and that some did — an import that reports only the failure reads as if nothing happened, and the
// owner picks the whole set again over the copies that are already there.
export function describeImportFailure(failedNames: readonly string[], addedCount: number): string {
  const names = listNames(failedNames)
  return addedCount === 0
    ? t('imported.failed', { names })
    : t('imported.partial', { names, added: addedCount, total: addedCount + failedNames.length })
}
