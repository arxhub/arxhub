import { illegalState } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { type FileHead, type RangeReader, resolveRange } from '@arxhub/vfs'
import type { Repo } from './repo'
import type { Snapshot, SnapshotFile, SnapshotFileChunk } from './types'

export type FetchMissingChunks = (hashes: string[]) => Promise<void>

type ChunkSpan = {
  chunk: SnapshotFileChunk
  start: number
  end: number
}

// A reader over ONE immutable manifest entry. The snapshot and its chunk list are captured when the
// reader is opened, so a concurrent sync can advance repo/head without making later requests read a
// different version of the file.
export class SnapshotRangeReader implements RangeReader {
  private readonly repo: Repo
  private readonly snapshot: Snapshot
  private readonly file: SnapshotFile
  private readonly fetchMissing?: FetchMissingChunks
  private readonly spans: ChunkSpan[] | null
  private fullContent: Promise<Uint8Array> | null = null

  constructor(repo: Repo, snapshot: Snapshot, file: SnapshotFile, fetchMissing?: FetchMissingChunks) {
    this.repo = repo
    this.snapshot = snapshot
    this.file = file
    this.fetchMissing = fetchMissing
    this.spans = this.buildSpans(file)
  }

  async head(): Promise<FileHead> {
    const size = this.spans == null ? (await this.loadLegacyContent()).byteLength : (this.file.size ?? this.spans.at(-1)?.end ?? 0)
    const timestamp = this.snapshot.timestamp * 1000
    return { size, modifiedAt: timestamp, createdAt: timestamp }
  }

  async readRange(offset: number, length?: number): Promise<Uint8Array> {
    if (this.spans == null) {
      // Validate the grammar before the legacy fallback starts fetching every chunk. Its size is not
      // known until those chunks are joined, but validation itself is independent of the size.
      resolveRange(0, offset, length)
      const bytes = await this.loadLegacyContent()
      const { start, end } = resolveRange(bytes.byteLength, offset, length)
      return bytes.slice(start, end)
    }

    const size = this.file.size ?? this.spans.at(-1)?.end ?? 0
    const { start, end } = resolveRange(size, offset, length)
    if (start >= end) return new Uint8Array(0)

    const intersecting = this.spans.filter((span) => span.end > start && span.start < end)
    await this.ensureChunks(intersecting.map(({ chunk }) => chunk.hash))

    const result = new Uint8Array(end - start)
    let written = 0
    for (const { chunk, start: chunkStart, end: chunkEnd } of intersecting) {
      const bytes = await this.repo.getChunkFile(chunk.hash).read()
      const declaredSize = chunkEnd - chunkStart
      if (bytes.byteLength !== declaredSize) {
        throw illegalState(`Chunk ${chunk.hash} has ${bytes.byteLength} bytes; the manifest declares ${declaredSize}`)
      }
      const from = Math.max(0, start - chunkStart)
      const to = Math.min(declaredSize, end - chunkStart)
      result.set(bytes.subarray(from, to), written)
      written += to - from
    }
    if (written !== result.byteLength) {
      throw illegalState(`Short range read for ${this.file.pathname}: expected ${result.byteLength} bytes, got ${written}`)
    }
    return result
  }

  private buildSpans(file: SnapshotFile): ChunkSpan[] | null {
    if (file.chunks.some((chunk) => chunk.size === undefined)) return null
    if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0)) {
      throw illegalState(`Invalid size metadata for ${file.pathname}`)
    }

    let running = 0
    const spans = file.chunks.map((chunk) => {
      const size = chunk.size
      if (!Number.isSafeInteger(size) || (size ?? -1) < 0) throw illegalState(`Invalid chunk size metadata for ${file.pathname}`)
      const start = running
      running += size ?? 0
      if (!Number.isSafeInteger(running)) throw illegalState(`Chunk sizes overflow for ${file.pathname}`)
      return { chunk, start, end: running }
    })
    if (file.size !== undefined && running !== file.size) {
      throw illegalState(`Chunk sizes for ${file.pathname} total ${running}; the manifest declares ${file.size}`)
    }
    return spans
  }

  private async ensureChunks(hashes: string[]): Promise<void> {
    const missing: string[] = []
    for (const hash of new Set(hashes)) {
      if (!(await this.repo.getChunkFile(hash).exists())) missing.push(hash)
    }
    if (missing.length === 0) return
    if (this.fetchMissing == null) {
      throw illegalState(`The requested part of ${this.file.pathname} is unavailable offline. Connect to the sync server and retry.`)
    }
    await this.fetchMissing(missing)
    for (const hash of missing) {
      if (!(await this.repo.getChunkFile(hash).exists())) throw illegalState(`Chunk ${hash} is still missing after download`)
    }
  }

  private loadLegacyContent(): Promise<Uint8Array> {
    this.fullContent ??= this.readLegacyContent()
    return this.fullContent
  }

  private async readLegacyContent(): Promise<Uint8Array> {
    await this.ensureChunks(this.file.chunks.map((chunk) => chunk.hash))
    const parts: Uint8Array[] = []
    let size = 0
    for (const chunk of this.file.chunks) {
      const bytes = await this.repo.getChunkFile(chunk.hash).read()
      parts.push(bytes)
      size += bytes.byteLength
    }
    const content = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      content.set(part, offset)
      offset += part.byteLength
    }
    if (sha256(content) !== this.file.hash) throw illegalState(`File integrity check failed for ${this.file.pathname}`)
    return content
  }
}
