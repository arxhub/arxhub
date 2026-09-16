import { posix } from '@arxhub/path'

const { extname } = posix

// The name a create gesture falls back to when the one it asked for is taken: 'note.md' → 'note 2.md'
// → 'note 3.md'. Attempt 1 is the name as given, so a caller's loop starts at the name that was
// actually wanted rather than at ' 2'. Split on the extension rather than appended after it, or every
// retry would hand the vault a file whose type no reader can see.
export function nthCandidateName(name: string, attempt: number): string {
  if (attempt <= 1) return name
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return `${stem} ${attempt}${ext}`
}

// The first candidate `isTaken` says nothing holds. Async because "taken" is a question for the vault
// and not for a list that could be handed in: the caller serialises the ask and the write together
// (ExplorerExtension.serializeCreation), so two gestures in one session cannot both be told a name is
// free. Unbounded on purpose — it ends the moment a free name exists, and one always does.
export async function freeName(name: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const candidate = nthCandidateName(name, attempt)
    if (!(await isTaken(candidate))) return candidate
  }
}
