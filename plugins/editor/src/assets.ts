import { validation } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'

export interface ArxAsset {
  path: string
  name: string
  mime: string
  size: number
}

export interface ArxAssetStore {
  put(file: File): Promise<ArxAsset>
  read(asset: ArxAsset): Promise<Uint8Array>
}

export const isImageAsset = (mime: string): boolean => /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime)

export function validateAssetPath(value: unknown): void {
  if (value !== null && (typeof value !== 'string' || !/^attachments\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)))
    throw validation('Invalid attachment path')
}

export function createAssetStore(vfs: Pick<VirtualFileSystem, 'read' | 'write'>): ArxAssetStore {
  return {
    async put(file) {
      if (file.size > 64 * 1024 * 1024) throw validation('Attachments can be up to 64 MB')
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'file'
      const path = `attachments/${crypto.randomUUID()}-${filename}`
      await vfs.write(path, new Uint8Array(await file.arrayBuffer()))
      return { path, name: file.name || 'File', mime: file.type || 'application/octet-stream', size: file.size }
    },
    async read(asset) {
      validateAssetPath(asset.path)
      return vfs.read(asset.path)
    },
  }
}
