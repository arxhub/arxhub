import { posix } from '@arxhub/path'
import { mergeText } from '@arxhub/sync'
import type { ContentMergerRegistration } from './content-mergers'

export const DEFAULT_TEXT_EXTENSIONS: readonly string[] = ['md', 'txt', 'markdown']

// What the config file says, as what matches() compares against. `undefined` is "the owner never touched
// it" and means the default list; `[]` is a decision — text merging switched off — and stays empty.
export function toTextExtensions(raw: readonly string[] | undefined): ReadonlySet<string> {
  const extensions = new Set<string>()
  for (const entry of raw ?? DEFAULT_TEXT_EXTENSIONS) {
    const extension = entry.trim().replace(/^\.+/, '').toLowerCase()
    if (extension) extensions.add(extension)
  }
  return extensions
}

// Strict on purpose: a byte sequence that is not UTF-8, or that carries a NUL, is not a text file
// whatever its extension says, and a line merge over it would corrupt it. `ignoreBOM` keeps a leading
// byte-order mark as content so it comes back out where it went in, instead of being silently dropped.
function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}

// The line merge for whatever the owner lists as text (`merge.textExtensions`). `extensions` is read on
// every match rather than captured, so a settings save applies to the next round without re-registering.
// No base means no common ancestor, and a union of two unrelated line sets is guesswork — that case
// stays a conflict copy, so the merger declines rather than mergeText guessing.
export function textMerger(extensions: () => ReadonlySet<string>): ContentMergerRegistration {
  return {
    id: 'text',
    fallback: true,
    matches: (pathname) => extensions().has(posix.extname(pathname).slice(1).toLowerCase()),
    merge: async (_pathname, base, local, remote) => {
      if (base == null) return null
      const [baseText, localText, remoteText] = [decodeText(base), decodeText(local), decodeText(remote)]
      if (baseText == null || localText == null || remoteText == null) return null
      const { merged, conflicts } = mergeText(baseText, localText, remoteText)
      return { merged: new TextEncoder().encode(merged), conflicts }
    },
  }
}
