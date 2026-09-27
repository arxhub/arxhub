import type { VirtualFileSystem } from '@arxhub/vfs'
import { budgetError } from './errors'
import { type BudgetAttachment, validateBudgetAttachment } from './model'

const MAX_PHOTO_SIZE = 10 * 1024 * 1024

const photoTypes = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  'image/webp': {
    extension: 'webp',
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  },
} as const

type PhotoMimeType = keyof typeof photoTypes

function photoType(mimeType: string): (typeof photoTypes)[PhotoMimeType] {
  const type = photoTypes[mimeType as PhotoMimeType]
  if (!type) throw budgetError('BudgetPhotoType')
  return type
}

function validatePhotoBytes(bytes: Uint8Array, mimeType: string): void {
  if (bytes.length < 1) throw budgetError('BudgetPhotoEmpty')
  if (bytes.length > MAX_PHOTO_SIZE) throw budgetError('BudgetPhotoTooLarge')
  if (!photoType(mimeType).matches(bytes)) throw budgetError('BudgetPhotoContent', { mimeType })
}

function checkedAttachment(value: unknown): BudgetAttachment {
  const attachment = validateBudgetAttachment(value)
  const type = photoType(attachment.mimeType)
  if (attachment.path !== `receipts/${attachment.id}.${type.extension}`) throw budgetError('BudgetPhotoPathInvalid')
  return attachment
}

export class ReceiptPhotoStore {
  public constructor(private readonly vfs: Pick<VirtualFileSystem, 'read' | 'write' | 'delete'>) {}

  public async add(file: File): Promise<BudgetAttachment> {
    if (file.size < 1) throw budgetError('BudgetPhotoEmpty')
    if (file.size > MAX_PHOTO_SIZE) throw budgetError('BudgetPhotoTooLarge')
    const type = photoType(file.type)
    const bytes = new Uint8Array(await file.arrayBuffer())
    validatePhotoBytes(bytes, file.type)
    const id = crypto.randomUUID()
    const attachment = checkedAttachment({
      id,
      path: `receipts/${id}.${type.extension}`,
      name: file.name || `Receipt.${type.extension}`,
      mimeType: file.type,
      size: bytes.length,
    })
    await this.vfs.write(attachment.path, bytes)
    return attachment
  }

  public async read(value: BudgetAttachment): Promise<Blob> {
    const attachment = checkedAttachment(value)
    const bytes = await this.vfs.read(attachment.path)
    if (bytes.length !== attachment.size) throw budgetError('BudgetPhotoSizeMismatch')
    validatePhotoBytes(bytes, attachment.mimeType)
    return new Blob([bytes.slice().buffer as ArrayBuffer], { type: attachment.mimeType })
  }

  public async discard(value: BudgetAttachment): Promise<void> {
    const attachment = checkedAttachment(value)
    await this.vfs.delete(attachment.path, { force: true })
  }
}
