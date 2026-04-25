import type { VirtualEntry } from './virtual-entry'
import type { VirtualWalker } from './virtual-walker'

export interface VirtualDir extends VirtualEntry {
  readonly kind: 'dir'
  list(): Promise<VirtualEntry[]>
  walk(cursor?: string): VirtualWalker
}
