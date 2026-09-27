import { validation } from '@arxhub/errors'
import { formatBytes } from '@arxhub/i18n'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { editorError } from './errors'

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

const MAX_ATTACHMENT_SIZE = 64 * 1024 * 1024

export const isImageAsset = (mime: string): boolean => /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime)

export function validateAssetPath(value: unknown): void {
  if (value !== null && (typeof value !== 'string' || !/^attachments\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)))
    throw validation('Invalid attachment path')
}

export function createAssetStore(vfs: Pick<VirtualFileSystem, 'read' | 'write'>): ArxAssetStore {
  return {
    async put(file) {
      if (file.size > MAX_ATTACHMENT_SIZE) throw editorError('AttachmentTooLargeError', { size: formatBytes(MAX_ATTACHMENT_SIZE) })
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
