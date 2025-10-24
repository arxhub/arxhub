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
    if (this.rabin == null) {
      this.lock.acquire('rabin', async () => {
        this.rabin?.free()
        this.rabin = await create(bits, minSize, maxSize, windowSize)
      })
    }
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

  async merge(chunks: VirtualFile[]): Promise<ReadableStream<Uint8Array>> {
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          const stream = await chunk.readable()
          const reader = stream.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            controller.enqueue(value)
          }
        }
        controller.close()
      },
    })
  }
}
