import AsyncLock from 'async-lock'
import type { Repo } from './repo'

export type SyncEngineOptions = {
  local: Repo
  remote: Repo
}

export class SyncEngine {
  private readonly lock: AsyncLock
  private readonly local: Repo
  private readonly remote: Repo

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

      // Create new snapshot, to calculate new local changes into hashes
      await this.local.commit()

      const localSnapshot = await this.local.getHeadSnapshot()
      const remoteSnapshot = await this.remote.getHeadSnapshot()
      const baseSnapshot = await this.local.findBaseSnapshot(localSnapshot.hash, remoteSnapshot.hash)

      await this.local.merge(baseSnapshot?.files ?? {}, localSnapshot.files, remoteSnapshot.files)

      // Create rebase like, where we move all local changes over remote
      await this.local.getHeadFile().writeText(remoteSnapshot.hash)
      const latest = await this.local.commit()

      for await (const snapshot of this.local.listSnapshots()) {
        await this.local.upload(this.remote, snapshot.name)
      }

      await this.local.getHeadFile().writeText(latest.hash)
      await this.remote.getHeadFile().writeText(latest.hash)
    })
  }

  private async prepare(): Promise<void> {
    await this.local.prepare()
    await this.remote.prepare()
  }
}
