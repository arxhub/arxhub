import type { VirtualFile } from '@arxhub/vfs'

export type ConflictResolver = (curent: VirtualFile, incoming: VirtualFile) => VirtualFile | Promise<VirtualFile>
