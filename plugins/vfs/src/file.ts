import type { VirtualFileSystem } from './system'

export interface VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly location: string
  readonly pathname: string
  readonly path: string
  readonly name: string
  readonly extension: string

  readonly fields: Record<string, unknown>
  readonly type: string
  readonly kind: string

  text(): Promise<string>
  stat(): string
}
