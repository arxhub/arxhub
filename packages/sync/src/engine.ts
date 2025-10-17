import { mkdir } from 'node:fs/promises'
import { ChangeSetStore } from 'src/change-set-store/ChangeSetStore'
import type { Cloud } from 'src/cloud/cloud'

export type SyncEngineOptions = {
  baseDir: string
  cloud: Cloud
  changeSetStore: ChangeSetStore
}

export class SyncEngine {
  private readonly baseDir: string
  private readonly cloud: Cloud
  private readonly changeSetStore: ChangeSetStore
  private initialized: boolean

  constructor(opts: SyncEngineOptions) {
    this.baseDir = opts.baseDir
    this.cloud = opts.cloud
    this.changeSetStore = opts.changeSetStore
    this.initialized = false
  }

  private async initialize(): Promise<void> {
    this.initialized = true
  }

  async pull(ref?: string): Promise<void> {
    // This method should:
    // 1. Fetch the latest remote HEAD.json or a specific revision (ref).
    // 2. Download and decrypt necessary revision files and chunks.
    // 3. Apply changes to the local baseDir and SQLite database.
    console.log(`Pulling changes (ref: ${ref || 'latest'})...`)
  }

  async push(): Promise<void> {
    await this.cloud.initialize()
    // This method should:
    // 1. Identify local commits that have not been pushed.
    // 2. Upload new encrypted chunks and revision files to S3.
    // 3. Perform an atomic update of /HEAD.json on S3.
    console.log('Pushing local commits...')
  }

  async reset(ref: string): Promise<void> {
    // This method should:
    // 1. Rollback the local baseDir and SQLite database to a specific revision (ref).
    // 2. This might involve re-applying revisions or restoring from a snapshot.
    console.log(`Resetting to revision: ${ref}...`)
  }

  async commit(): Promise<string> {
    // This method should:
    // 1. Identify dirty files in baseDir.
    // 2. Create new chunks for modified files.
    // 3. Generate a new revision (snapshot) containing changes and chunk references.
    // 4. Store the revision locally.
    // 5. Mark files as synced.
    console.log('Committing changes...')
    return 'new-commit-id' // Placeholder
  }

  async add(pathname?: string): Promise<void> {
    // This method should:
    // 1. Re-scan the baseDir to identify any files that have been modified externally
    //    and are not yet marked as 'dirty' in the local state.
    // 2. Update their status to 'dirty' if changes are detected.
    console.log('Revalidating dirty objects in baseDir...')
  }

  async prune(): Promise<void> {
    // This method should:
    // 1. Identify chunks and revisions that are no longer referenced by any active revision.
    // 2. Delete them from local storage and mark for remote deletion (during next push).
    console.log('Running garbage collection...')
  }
}
