import type { VirtualFile } from '../virtual-file'

export interface VirtualWalker extends AsyncIterable<VirtualFile> {
  cursor(): string
  hasNext(): Promise<boolean>
  next(): Promise<VirtualFile | null>
}

export function serializeCursor(state: { queue: string[]; pending: string[] }): string {
  return btoa(JSON.stringify(state))
}

export function deserializeCursor(token: string): { queue: string[]; pending: string[] } {
  try {
    return JSON.parse(atob(token)) as { queue: string[]; pending: string[] }
  } catch {
    return { queue: [], pending: [] }
  }
}
