import { type ComputedRef, computed, ref } from 'vue'

// One section's staged edit. `commit` writes it wherever the section persists; `revert` puts the
// section's own UI back to what is on disk.
export interface StagedChange {
  sectionId: string
  title: string
  // The full draft, held here rather than only in the page: a section's tab is unmounted whenever
  // the user leaves Settings, and an edit that vanishes on navigation was never really staged.
  values: Record<string, unknown>
  // Field keys that differ from the saved values — what the confirmation list shows.
  keys: string[]
  // True while any staged field fails its own validation; blocks the global save.
  invalid: boolean
  commit: () => Promise<void>
  // Resets the section's UI if it happens to be mounted. The entry is dropped either way, so a
  // change staged on a page that has since been closed is still revertible.
  revert: () => void
}

export interface PendingChanges {
  readonly staged: ComputedRef<StagedChange[]>
  readonly fieldCount: ComputedRef<number>
  readonly sectionCount: ComputedRef<number>
  readonly invalid: ComputedRef<boolean>
  readonly saving: ComputedRef<boolean>
  // Called by a section on every edit. Passing no changed keys clears the section.
  stage(change: StagedChange): void
  clear(sectionId: string): void
  // The draft a section should re-open with, if it has one staged.
  draftFor(sectionId: string): Record<string, unknown> | undefined
  saveAll(): Promise<void>
  revertAll(): void
}

/**
 * Settings edits are staged, not written per page: a change made in one section stays pending
 * alongside changes made in another until one Save applies them all. Same model as OpenWrt's
 * "unsaved changes" bar — you can move between sections while composing a change set, and one
 * action commits or drops the lot.
 */
export function createPendingChanges(onError?: (sectionId: string, error: unknown) => void): PendingChanges {
  const entries = ref(new Map<string, StagedChange>())
  const saving = ref(false)

  const staged = computed(() => [...entries.value.values()])
  const fieldCount = computed(() => staged.value.reduce((total, change) => total + change.keys.length, 0))
  const sectionCount = computed(() => staged.value.length)
  const invalid = computed(() => staged.value.some((change) => change.invalid))

  function stage(change: StagedChange): void {
    const next = new Map(entries.value)
    if (change.keys.length === 0) next.delete(change.sectionId)
    else next.set(change.sectionId, change)
    entries.value = next
  }

  function draftFor(sectionId: string): Record<string, unknown> | undefined {
    return entries.value.get(sectionId)?.values
  }

  function clear(sectionId: string): void {
    if (!entries.value.has(sectionId)) return
    const next = new Map(entries.value)
    next.delete(sectionId)
    entries.value = next
  }

  async function saveAll(): Promise<void> {
    if (saving.value || invalid.value) return
    saving.value = true
    try {
      // Sequential, and a failure stops the run: sections write to separate files, so carrying on
      // after one fails would leave a half-applied change set with no record of where it stopped.
      // The failed section and everything after it stay staged, so a retry resumes from there.
      for (const change of staged.value) {
        try {
          await change.commit()
        } catch (error) {
          onError?.(change.sectionId, error)
          return
        }
        clear(change.sectionId)
      }
    } finally {
      saving.value = false
    }
  }

  function revertAll(): void {
    for (const change of staged.value) change.revert()
    entries.value = new Map()
  }

  return {
    staged,
    fieldCount,
    sectionCount,
    invalid,
    saving: computed(() => saving.value),
    stage,
    clear,
    draftFor,
    saveAll,
    revertAll,
  }
}
