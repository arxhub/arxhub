import dedent from 'ts-dedent'
import type { VirtualFile, VirtualFileProps } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export type ProxyFileOptions = {
  prefix: string
}

export class ProxyFile implements VirtualFile {
  private readonly actual: VirtualFile
  private readonly prefix: string | null
  readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem, actual: VirtualFile, options?: ProxyFileOptions) {
    this.actual = actual
    this.prefix = options?.prefix || null
    this.vfs = vfs
  }

  get pathname(): string {
    if (this.prefix == null) return this.actual.pathname
    return `${this.prefix}/${this.actual.pathname}`
  }

  get path(): string {
    if (this.prefix == null) return this.actual.path
    return `${this.prefix}/${this.actual.path}`
  }

  get name(): string {
    return this.actual.name
  }

  get extension(): string {
    return this.actual.extension
  }

  get fields(): Record<string, unknown> {
    return this.actual.fields
  }

  get metadata(): Record<string, unknown> {
    return this.actual.metadata
  }

  get contentType(): string {
    return this.actual.contentType
  }

  get moduleType(): string {
    return this.actual.moduleType
  }

  readText(): Promise<string> {
    return this.actual.readText()
  }

  writeText(content: string): Promise<void> {
    return this.actual.writeText(content)
  }

  stat(): string {
    return dedent`
      pathname: ${this.pathname}
      extension: ${this.extension}
      type: ${this.contentType}
      kind: ${this.moduleType}
    `
  }

  props(): VirtualFileProps {
    return {
      ...this.actual.props(),
      pathname: this.pathname,
      path: this.path,
      name: this.name,
    }
  }
}
