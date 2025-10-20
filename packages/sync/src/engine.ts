import type { Local } from './local'
import type { Remote } from './remote'
import type { ConflictResolver, Snapshot } from './types'

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

  async add(path: string): Promise<void> {
    await this.local.add(path)
  }

  /**
   * Orchestrates the synchronization process: pull, commit, and push.
   * Ensures local and remote repositories are in sync, handling conflicts.
   */
  async sync(): Promise<void> {
    // TODO: Maybe set lock in remote on sync
    // 1. Call pull() to fetch remote changes and handle initial conflicts.
    // 2. If conflicts are detected during pull, mark them for manual resolution and exit.
    // 3. Call commit() to gather local changes and create a new local revision.
    // 4. Call push() to send local changes to the remote.
  }

  async pull(hash: string = 'head'): Promise<void> {
    await this.local.download(this.remote, hash)
    await this.local.unpack(hash, (_, incoming) => incoming)
  }

  /**
   * Uploads all local revisions that do not exist on the remote.
   */
  async push(hash: string = 'head'): Promise<void> {
    await this.local.upload(this.remote, hash)
    await this.remote.updateHead(hash)
  }


  /**
   * Gathers the status of changed files locally, creates chunks, and a new revision.
   * @returns The hash of the new local commit.
   */
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

  /**
   * Rolls back the local baseDir and SQLite database to a specific revision.
   * @param hash The hash of the revision to reset to.
   */
  async reset(hash: string): Promise<void> {
    // This method should:
    // 1. Unpack and apply the specified snapshot hash to the local baseDir and SQLite database.
    // 2. This might involve re-applying revisions or restoring from a snapshot.
    console.log(`Resetting to revision: ${hash}...`)
  }

  async prune(): Promise<void> {
    // This method should:
    // 1. Identify chunks and revisions that are no longer referenced by any active revision.
    // 2. Delete them from local storage and mark for remote deletion (during next push).
    console.log('Running garbage collection...')
  }
}
