import type { MountableFileSystem } from '@arxhub/plugin-vfs/api'

export type FilesEnv = {
  Variables: {
    vfs: MountableFileSystem
  }
}
