import type { VirtualFileSystem } from './system'

export interface VirtualFile {
  readonly vfs: VirtualFileSystem

  // /home/user/file.txt
  readonly pathname: string

  // /home/user
  readonly path: string

  // file.txt
  readonly name: string

  // txt
  readonly extension: string

  readonly fields: Record<string, unknown>
  readonly type: string
  readonly kind: string

  readText(): Promise<string>

  writeText(content: string): Promise<void>

  // TODO: return object with fields: size, mtime, etc
  stat(): string
}
