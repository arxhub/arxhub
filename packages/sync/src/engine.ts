import AsyncLock from 'async-lock'
import { keepBothConflictResolver } from 'src/keep-both-conflict-resolver'
import type { Local } from './local'
import type { Remote } from './remote'

export type SyncEngineOptions = {
  local: Local
  remote: Remote
}

export class SyncEngine {
  private readonly lock: AsyncLock
  private readonly local: Local
  private readonly remote: Remote

  constructor(opts: SyncEngineOptions) {
    this.lock = new AsyncLock()
    this.local = opts.local
    this.remote = opts.remote
  }

  async add(path: string): Promise<void> {
    await this.local.add(path)
  }

  async sync(): Promise<void> {
    await this.lock.acquire('sync', async () => {
      await this.prepare()

      for await (const snapshot of this.remote.listSnapshots()) {
        await this.local.download(this.remote, snapshot.name)
      }

      const localSnapshot = await this.local.commit()
      const remoteSnapshot = await this.remote.getHeadSnapshot()
      const baseSnapshot = await this.local.findBaseSnapshot(localSnapshot.hash, remoteSnapshot.hash)

      await this.local.merge(baseSnapshot?.files ?? {}, localSnapshot.files, remoteSnapshot.files, keepBothConflictResolver)
    })
  }

  private async prepare(): Promise<void> {
    await this.local.prepare()
    await this.remote.prepare()
  }
}
