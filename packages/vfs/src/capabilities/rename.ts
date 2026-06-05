export interface RenameCapable {
  rename(src: string, dest: string): Promise<void>
}

export function isRenameCapable(vfs: unknown): vfs is RenameCapable {
  return typeof (vfs as RenameCapable).rename === 'function'
}
