import { hc } from 'hono/client'
import type { files } from './routes/files'

export const gateway = {
  files: hc<typeof files>('/vfs/files'),
}
