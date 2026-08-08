export type MergeResult = {
  // Vault paths of the conflict copies a merge wrote — the copy's own path, never the original the
  // conflict was detected against, since that path never moved.
  conflicts: string[]
}
