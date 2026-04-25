import type { VirtualFile } from './virtual-file'

export interface VfsListCursor extends AsyncIterable<VirtualFile> {
  cursor(): string
}

export interface VfsBFSState {
  queue: string[]
  pending: string[]
}

export function serializeCursor(state: VfsBFSState): string {
  return btoa(JSON.stringify(state))
}

export function deserializeCursor(token: string): VfsBFSState {
  return JSON.parse(atob(token)) as VfsBFSState
}
