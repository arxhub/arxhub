export type MergeResult = {
  // Vault paths of the conflict copies a merge wrote — the copy's own path, never the original the
  // conflict was detected against, since that path never moved.
  conflicts: string[]

  // Vault paths a content merger absorbed instead of writing a whole-file copy for — the count is how
  // many of the merger's own conflicts (e.g. block-level conflicts inside a document) are still
  // unresolved in the written file, so a caller can point the user at it rather than a copy beside it.
  unresolved: { pathname: string; count: number }[]

  // Vault paths where one side deleted a file the other kept editing. The edit always wins — there is
  // no document left on the deleting side to hold a decision in, so this is not offered to a content
  // merger at all — but it is still a choice made FOR the user, reported so the UI can say so.
  decisions: { pathname: string; kind: 'edit-over-delete' }[]
}
