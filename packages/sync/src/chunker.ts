import type { VirtualFile } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import { create, cut, type Rabin } from 'rabin-rs'

const KB = 1024
const MB = 1024 * KB

const bits = 21
const minSize = 512 * KB
const maxSize = 8 * MB
const windowSize = 64

export class Chunker {
  private rabin!: Rabin
  private readonly lock: AsyncLock

  constructor() {
    this.lock = new AsyncLock()
  }

  private async initialize(): Promise<void> {
    if (this.rabin != null) return
    // Acquire the lock BEFORE (re)checking — concurrent split() calls could otherwise all pass the
    // outer null check and each create+free a Rabin instance (use-after-free). Double-check inside.
    await this.lock.acquire('rabin', async () => {
      if (this.rabin != null) return
      this.rabin = await create(bits, minSize, maxSize, windowSize)
    })
  }

  async *split(file: VirtualFile): AsyncGenerator<Uint8Array> {
    await this.initialize()

    let stream: ReadableStream<Uint8Array> | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      stream = await file.readable()
      reader = stream.getReader()

      let bytes = new Uint8Array()
      while (true) {
        const { done, value } = await reader.read()

        if (value) {
          const chunk = new Uint8Array(bytes.length + value.length)
          chunk.set(bytes)
          chunk.set(value, bytes.length)
          bytes = chunk
        }

        if (bytes.length === 0) {
          break
        }

        const cuts = cut(this.rabin, bytes, done)
        for (const cutOffset of cuts) {
          yield bytes.subarray(0, cutOffset)
          bytes = bytes.subarray(cutOffset)
        }
      }
    } finally {
      reader?.releaseLock()
      await stream?.cancel()
    }
  }

  merge(chunks: VirtualFile[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const chunk of chunks) {
            const stream = await chunk.readable()
            const reader = stream.getReader()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) {
                  break
                }
                controller.enqueue(value)
              }
            } finally {
              // Always release the lock and cancel, even if a downstream chunk read throws,
              // so a failed merge can't strand readers or leave the pipeTo() consumer hanging.
              reader.releaseLock()
              await stream.cancel()
            }
          }
          controller.close()
        } catch (error) {
          // Propagate to the consumer (pipeTo rejects) instead of silently hanging.
          controller.error(error)
        }
      },
    })
  }
}
