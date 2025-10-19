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

  async add(path: string): Promise<void> {
    await this.local.add(path)
  }

  /**
   * Orchestrates the synchronization process: pull, commit, and push.
   * Ensures local and remote repositories are in sync, handling conflicts.
   */
  async sync(): Promise<void> {
    // 1. Call pull() to fetch remote changes and handle initial conflicts.
    // 2. If conflicts are detected during pull, mark them for manual resolution and exit.
    // 3. Call commit() to gather local changes and create a new local revision.
    // 4. Call push() to send local changes to the remote.
  }

  /**
   * Downloads all remote revisions and attempts to unpack the head.
   * Marks conflicts if they arise during the unpack/merge process.
   * @param ref Optional reference to a specific revision to pull.
   */
  async pull(ref?: string): Promise<void> {
    // This method should:
    // 1. Call _fetchRemoteHead(ref) to get the latest remote HEAD.json or a specific revision.
    // 2. Call _downloadRemoteFiles(snapshot) to download and decrypt necessary revision files and chunks.
    // 3. Call _unpackRemoteHead(snapshot) to handle chunk merging, decryption, and applying changes
    //    to the local baseDir and SQLite database. This is where conflicts will be detected and marked.
    console.log(`Pulling changes (ref: ${ref || 'latest'})...`)
  }

  /**
   * Uploads all local revisions that do not exist on the remote.
   */
  async push(): Promise<void> {
    // This method should:
    // 1. Call _uploadLocalRevisions() to identify and upload new encrypted chunks and revision files to S3.
    // 2. Call _updateRemoteHead(newHead) to perform an atomic update of /HEAD.json on S3.
    console.log('Pushing local commits...')
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
