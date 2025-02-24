import { RenderMode } from '~/plugins/render/api/render-mode.ts'

export interface RenderOptions {
  mode: RenderMode
  data?: Record<string, unknown>
}
