import type { VirtualFileSystem } from '@arxhub/vfs'

export type ConflictResolver = (vfs: VirtualFileSystem, pathname: string, current: ReadableStream<Uint8Array>, incoming: ReadableStream<Uint8Array>) => Promise<void>
