import { posix } from '@arxhub/path'

const { basename, extname } = posix

// OR-03: what a file is CALLED on screen — the tree's row and the strip above the open document ask the
// same question and get the same answer. The rule lives beside the viewer registry because that
// registry is what "known" means: `isKnownExtension` is passed in (in practice `NotesExtension.viewerFor`)
// so this stays a pure function of its inputs, and nothing memoizes — the set of known extensions is
// dynamic by construction, a plugin switched off never claims its extension again.
export interface DisplayName {
  // What is shown, and the whole of what a rename field holds.
  readonly text: string
  // The tail kept off screen — '' whenever the full name is shown.
  readonly hiddenExtension: string
  // The basename a rename writes: what was typed, with the hidden tail glued back on. A file must not
  // lose its extension because it happened not to be on screen while its owner renamed it — and while
  // the setting is off there is no tail, so the field edits the extension too. That off-switch is the
  // only road to changing an extension, which is why no surface offers a control of its own for it.
  fullName(edited: string): string
}

function hiddenExtensionOf(pathname: string, hideKnownExtensions: boolean, isKnownExtension: (pathname: string) => boolean): string {
  if (!hideKnownExtensions) return ''
  const ext = extname(pathname)
  if (ext === '') return ''
  return isKnownExtension(pathname) ? ext : ''
}

export function displayNameOf(pathname: string, hideKnownExtensions: boolean, isKnownExtension: (pathname: string) => boolean): DisplayName {
  const name = basename(pathname) || pathname
  const hiddenExtension = hiddenExtensionOf(pathname, hideKnownExtensions, isKnownExtension)
  return {
    text: hiddenExtension ? name.slice(0, -hiddenExtension.length) : name,
    hiddenExtension,
    fullName: (edited) => `${edited}${hiddenExtension}`,
  }
}
