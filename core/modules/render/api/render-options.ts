import { RenderMode } from './render-mode.ts'

export type RenderOptions = {
  mode: RenderMode
  data?: Record<string, unknown>
}
