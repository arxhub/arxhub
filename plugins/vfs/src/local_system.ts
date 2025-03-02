import { isFileExists } from '~/stdlib/is_file_exists.ts'
import { listFiles } from '~/stdlib/list_files.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'
import { AbstractVirtualFileSystem } from '~/plugins/vfs/abstract_system.ts'
import { GenericFile, VirtualFileOptions } from '~/plugins/vfs/generic_file.ts'

export class LocalFileSystem extends AbstractVirtualFileSystem {
  readonly name: string
  private readonly rootDir: string

  constructor(name: string, rootDir: string) {
    super()
    this.name = name
    this.rootDir = rootDir
  }

  override _isFileExists(pathname: string): Promise<boolean> {
    return isFileExists(`${this.rootDir}/${pathname}`)
  }

  override async _fileOrNull(pathname: string): Promise<VirtualFile | null> {
    if (!(await this.isFileExists(pathname))) return null
    const meta = await this.readMeta(pathname)
    return new GenericFile(this, { ...meta, pathname })
  }

  // TODO: Add caching
  override async listFiles(): Promise<VirtualFile[]> {
    const files: VirtualFile[] = []
    for await (const pathname of listFiles(this.rootDir)) {
      if (pathname.endsWith('.meta')) continue
      const meta = JSON.parse(await Deno.readTextFile(`${pathname}.meta`))
      files.push(new GenericFile(this, meta))
    }
    return files
  }

  override _readTextFile(pathname: string): Promise<string> {
    return Deno.readTextFile(`${this.rootDir}/${pathname}`)
  }

  override refresh(): Promise<void> {
    // no-op for now
    // TODO: Add caching
    return Promise.resolve()
  }

  private async readMeta(pathname: string): Promise<Omit<VirtualFileOptions, 'pathname'>> {
    const meta = { type: 'application/octet-stream', kind: 'unknown', fields: {} }
    if (!pathname.endsWith('.meta')) pathname = `${pathname}.meta`
    if (!(await this.isFileExists(pathname))) {
      console.warn(`Meta file does not exists (location: "${this.name}:${pathname}")`)
      return meta
    }
    try {
      return { ...meta, ...JSON.parse(await this.readTextFile(pathname)) }
    } catch (e) {
      console.error(`Error reading meta file (location: "${this.name}:${pathname}")`, e)
      return meta
    }
  }
}
