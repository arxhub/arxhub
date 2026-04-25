export interface VirtualEntry {
  readonly pathname: string
  readonly kind: 'file' | 'dir'
}
