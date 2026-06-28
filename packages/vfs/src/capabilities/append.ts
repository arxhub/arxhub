export interface AppendCapable {
  append(pathname: string, content: Uint8Array): Promise<void>
}

export function isAppendCapable(vfs: unknown): vfs is AppendCapable {
  return typeof (vfs as AppendCapable).append === 'function'
}
