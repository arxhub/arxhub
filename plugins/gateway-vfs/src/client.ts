import { type ClientRequestOptions, hc } from 'hono/client'
import type { files } from './routes/files'

export function createGateway(options?: ClientRequestOptions) {
  return {
    files: hc<typeof files>('/vfs/files', options),
  }
}
