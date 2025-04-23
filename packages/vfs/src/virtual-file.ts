import type { VirtualFileSystem } from './virtual-file-system'

export interface VirtualFileProps {
  // readonly id: string
  // readonly revision: string

  // /home/user/file.txt
  readonly pathname: string

  // /home/user
  readonly path: string

  // file.txt
  readonly name: string

  // txt
  readonly extension: string

  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any in fields
  readonly fields: Record<string, any>
  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any in metadata
  readonly metadata: Record<string, any>
  readonly contentType: string
  readonly moduleType: string
}

export interface VirtualFile extends VirtualFileProps {
  readonly vfs: VirtualFileSystem

  readText(): Promise<string>

  writeText(content: string): Promise<void>

  // TODO: return object with fields: size, mtime, etc
  stat(): string

  props(): VirtualFileProps
}
