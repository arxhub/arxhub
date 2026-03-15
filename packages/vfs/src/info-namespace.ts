import type { Get, PartialDeep, Paths, WritableKeysOf } from 'type-fest'
import type { VirtualFileFields   } from './types/file-fields'
import type { VirtualFileMetadata   } from './types/file-metadata'

type VirtualFileInfo = {
  fields: VirtualFileFields
  metadata: VirtualFileMetadata
}

export interface InfoNamespace {
  get<K extends Paths<VirtualFileInfo>>(key: K): Promise<Get<VirtualFileInfo, K>>
  getAll(): Promise<VirtualFileInfo>

  set<K extends Paths<VirtualFileInfo>>(key: K, value: Get<VirtualFileInfo, K>): Promise<void>
  set(fields: PartialDeep<VirtualFileInfo>): Promise<void>

  delete<K extends Paths<VirtualFileInfo>>(key: K): Promise<void>

  isDirty(): boolean

  flush(): Promise<void>
}