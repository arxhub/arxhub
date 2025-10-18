import type { Local } from './local'
import type { Remote } from './remote'

export type SyncEngineOptions = {
  local: Local
  remote: Remote
}

export class SyncEngine {
  private readonly local: Local
  private readonly remote: Remote

  constructor(opts: SyncEngineOptions) {
    this.local = opts.local
    this.remote = opts.remote
  }

  async pull(ref?: string): Promise<void> {
    // This method should:
    // 1. Fetch the latest remote HEAD.json or a specific revision (ref).
    // 2. Download and decrypt necessary revision files and chunks.
    // 3. Apply changes to the local baseDir and SQLite database.
    console.log(`Pulling changes (ref: ${ref || 'latest'})...`)
  }

  async push(): Promise<void> {
    // This method should:
    // 1. Identify local commits that have not been pushed.
    // 2. Upload new encrypted chunks and revision files to S3.
    // 3. Perform an atomic update of /HEAD.json on S3.
    console.log('Pushing local commits...')
  }

  async reset(hash: string): Promise<void> {
    // This method should:
    // 1. Rollback the local baseDir and SQLite database to a specific revision (ref).
    // 2. This might involve re-applying revisions or restoring from a snapshot.
    console.log(`Resetting to revision: ${hash}...`)
  }

  async commit(): Promise<string> {
    const changes = await this.local.status()
    for (const change of changes) {
      // Here we need compare current local hash in revision
      // with real file hash on the disk
      //
      // If hashes is equal continue the loop
      //
      // Else create chunks, update current ref json with the new one
    }
    return ''
  }

  async add(path: string): Promise<void> {
    await this.local.add(path)
  }

  async prune(): Promise<void> {
    // This method should:
    // 1. Identify chunks and revisions that are no longer referenced by any active revision.
    // 2. Delete them from local storage and mark for remote deletion (during next push).
    console.log('Running garbage collection...')
  }
}
