import type { VirtualFileSystem } from './system'

export interface VirtualFileProps {
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
}

export interface VirtualFile<P extends VirtualFileProps = VirtualFileProps> extends VirtualFileProps {
  readonly vfs: VirtualFileSystem

  readText(): Promise<string>

  writeText(content: string): Promise<void>

  // TODO: return object with fields: size, mtime, etc
  stat(): string

  props(): P
}
