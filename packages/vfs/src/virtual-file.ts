
export interface VirtualFileProps {
  readonly id: string
  readonly version: number

  // /home/user/file.txt
  readonly pathname: string

  // /home/user
  readonly path: string

  // file.txt
  readonly name: string

  // .txt
  readonly extension: string

  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any in fields
  readonly fields: Record<string, any>
  // biome-ignore lint/suspicious/noExplicitAny: We want allow to use any in metadata
  readonly metadata: Record<string, any>
  readonly contentType: string
  readonly moduleType: string
}

export interface VirtualFile extends VirtualFileProps {
  read(): Promise<Buffer>
  readText(): Promise<string>
  readJSON<T>(): Promise<T>
  readable(): Promise<ReadableStream<Uint8Array>>

  write(content: Buffer): Promise<Buffer>
  writeText(content: string): Promise<void>
  writeJSON<T>(content: T): Promise<void>

  appendText(content: string): Promise<void>

  props(): VirtualFileProps

  sha256(): Promise<string>

  isExists(): Promise<boolean>
  isDirectory(): Promise<boolean>
}
