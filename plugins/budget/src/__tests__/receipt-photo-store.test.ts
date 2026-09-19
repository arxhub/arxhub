import type { DeleteOptions } from '@arxhub/vfs'
import { describe, expect, test, vi } from 'vitest'
import type { BudgetAttachment } from '../model'
import { ReceiptPhotoStore } from '../receipt-photo-store'

class PhotoVfs {
  readonly files = new Map<string, Uint8Array>()
  readonly deletes: Array<{ path: string; options?: DeleteOptions }> = []

  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes.slice())
  }

  async read(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(path)
    if (!bytes) throw new Error(`missing ${path}`)
    return bytes.slice()
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    this.deletes.push({ path, options })
    this.files.delete(path)
  }
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes.slice().buffer], name, { type })
}

describe('ReceiptPhotoStore', () => {
  test('stores an immutable UUID photo and verifies its bytes again when reading', async () => {
    const vfs = new PhotoVfs()
    const store = new ReceiptPhotoStore(vfs)
    const attachment = await store.add(file(jpeg, 'receipt.jpg', 'image/jpeg'))

    expect(attachment).toMatchObject({ name: 'receipt.jpg', mimeType: 'image/jpeg', size: jpeg.length })
    expect(attachment.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(attachment.path).toBe(`receipts/${attachment.id}.jpg`)
    const restored = await store.read(attachment)
    expect(restored.type).toBe('image/jpeg')
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(jpeg)

    vfs.files.set(attachment.path, new Uint8Array(jpeg.length))
    await expect(store.read(attachment)).rejects.toThrow(/does not match image\/jpeg/)
  })

  test('rejects mislabeled and non-image content before it reaches the VFS', async () => {
    const vfs = new PhotoVfs()
    const store = new ReceiptPhotoStore(vfs)

    await expect(store.add(file(jpeg, 'wrong.png', 'image/png'))).rejects.toThrow(/does not match image\/png/)
    await expect(store.add(file(new TextEncoder().encode('<svg/>'), 'receipt.svg', 'image/svg+xml'))).rejects.toThrow(/JPEG, PNG, or WebP/)
    expect(vfs.files.size).toBe(0)
  })

  test('never deletes a path whose UUID does not match the validated attachment id', async () => {
    const vfs = new PhotoVfs()
    const store = new ReceiptPhotoStore(vfs)
    const first = '11111111-1111-4111-8111-111111111111'
    const second = '22222222-2222-4222-8222-222222222222'
    const forged: BudgetAttachment = {
      id: first,
      path: `receipts/${second}.jpg`,
      name: 'Receipt',
      mimeType: 'image/jpeg',
      size: jpeg.length,
    }

    await expect(store.discard(forged)).rejects.toThrow(/Invalid receipt photo path/)
    expect(vfs.deletes).toEqual([])

    const valid = { ...forged, path: `receipts/${first}.jpg` }
    await store.discard(valid)
    expect(vfs.deletes).toEqual([{ path: valid.path, options: { force: true } }])
  })

  test('rejects oversized photos without reading or writing their body', async () => {
    const vfs = new PhotoVfs()
    const store = new ReceiptPhotoStore(vfs)
    const oversized = { size: 10 * 1024 * 1024 + 1, type: 'image/jpeg', arrayBuffer: vi.fn() } as unknown as File

    await expect(store.add(oversized)).rejects.toThrow(/up to 10 MB/)
    expect(oversized.arrayBuffer).not.toHaveBeenCalled()
    expect(vfs.files.size).toBe(0)
  })
})
