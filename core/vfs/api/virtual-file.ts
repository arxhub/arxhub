import { VirtualFileSystem } from './mod.ts'

export abstract class VirtualFile {
  protected constructor() {
  }

  abstract readonly vfs: VirtualFileSystem

  abstract readonly location: string
  abstract readonly pathname: string
  abstract readonly path: string
  abstract readonly name: string
  abstract readonly extension: string

  abstract readonly fields: Record<string, unknown>
  abstract readonly type: string
  abstract readonly kind: string

  abstract text(): Promise<string>
}
