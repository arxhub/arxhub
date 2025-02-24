import { isFileExists } from '~/stdlib/is_file_exists.ts'
import { listFiles } from '~/stdlib/list_files.ts'
import { VirtualFile, VirtualFileOptions } from '~/plugins/vfs/file.ts'
import { VirtualFileSystem } from '~/plugins/vfs/system.ts'
import { LocalFile } from '~/plugins/vfs/local_file_system/file.ts'

export class LocalFileSystem extends VirtualFileSystem {
  readonly name: string
  private readonly rootDir: string

  constructor(name: string, rootDir: string) {
    super()
    this.name = name
    this.rootDir = rootDir
  }

  override isFileExists(pathname: string): Promise<boolean> {
    return isFileExists(`${this.rootDir}/${pathname}`)
  }

  override async file(pathname: string): Promise<VirtualFile> {
    const file = await this.fileOrNull(pathname)
    if (file == null) throw new Error(`File not found in VFS (pathname: "${pathname}")`)
    return file
  }

  override async fileOrNull(pathname: string): Promise<VirtualFile | null> {
    if (!(await this.isFileExists(pathname))) return null
    const meta = await this.meta(pathname)
    return new LocalFile(this, { ...meta, pathname })
  }

  // TODO: Add caching
  override async listFiles(): Promise<VirtualFile[]> {
    const files: VirtualFile[] = []
    for await (const pathname of listFiles(this.rootDir)) {
      if (pathname.endsWith('.meta')) continue
      const meta = JSON.parse(await Deno.readTextFile(`${pathname}.meta`))
      files.push(new LocalFile(this, meta))
    }
    return files
  }

  override readTextFile(pathname: string | VirtualFile): Promise<string> {
    if (pathname instanceof VirtualFile) pathname = pathname.pathname
    return Deno.readTextFile(`${this.rootDir}/${pathname}`)
  }

  override refresh(): Promise<void> {
    // no-op for now
    // TODO: Add caching
    return Promise.resolve()
  }

  private async meta(pathname: string): Promise<Omit<VirtualFileOptions, 'pathname'>> {
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
