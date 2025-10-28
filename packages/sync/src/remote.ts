import type { VirtualFile } from '@arxhub/vfs'
import { Repo } from './repo'

export class Remote extends Repo {
  listSnapshots(): AsyncGenerator<VirtualFile> {
    return this.vfs.listSnapshots()
  }
}
