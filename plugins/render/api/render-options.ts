import { RenderMode } from './render-mode.ts'

export interface RenderOptions {
  mode: RenderMode
  data?: Record<string, unknown>
}
