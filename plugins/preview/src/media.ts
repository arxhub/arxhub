import { extname } from '@arxhub/path'
import { contentUrlOf, type VirtualFileSystem } from '@arxhub/vfs'

export type MediaKind = 'image' | 'audio' | 'video'

// Extension → MIME, per kind. Only what a webview plays natively: `.mkv` and `.avi` are containers no
// engine opens, and listing them would claim the file only to show a broken player. `.svg` is not here on
// purpose — it is text, hand-edited as often as viewed, and the text viewer keeps it (A-1).
const MEDIA: Record<MediaKind, Record<string, string>> = {
  image: {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  },
  audio: {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
  },
  video: {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ogv': 'video/ogg',
  },
}

export const MEDIA_KINDS: MediaKind[] = ['image', 'audio', 'video']

export function extensionsOf(kind: MediaKind): string[] {
  return Object.keys(MEDIA[kind])
}

export function mediaOf(path: string): { kind: MediaKind; mime: string } | null {
  const ext = extname(path).toLowerCase()
  for (const kind of MEDIA_KINDS) {
    const mime = MEDIA[kind][ext]
    if (mime != null) return { kind, mime }
  }
  return null
}

// Above this, a file is not read into memory for want of a URL: a blob URL IS the whole file in RAM,
// and a two-hour recording would take the tab down before it played a second.
export const BLOB_LIMIT = 256 * 1024 * 1024

export type MediaSource =
  // The backend can be loaded from directly — seeking and all — without the bytes passing through JS.
  | { kind: 'url'; url: string; size: number }
  // No URL: the file is read whole and served to the element as a blob.
  | { kind: 'bytes'; bytes: Uint8Array; mime: string; size: number }
  // No URL and too big to hold. The panel says so rather than trying.
  | { kind: 'too-large'; size: number }

export async function resolveMediaSource(vfs: VirtualFileSystem, path: string, mime: string, limit = BLOB_LIMIT): Promise<MediaSource> {
  const { size } = await vfs.head(path)
  const url = await contentUrlOf(vfs, path)
  if (url != null) return { kind: 'url', url, size }
  if (size > limit) return { kind: 'too-large', size }
  return { kind: 'bytes', bytes: await vfs.read(path), mime, size }
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}
