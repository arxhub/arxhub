import { RenderMode } from "~/plugins/render/api/render_mode.ts"

export interface RenderOptions {
  mode: RenderMode
  data?: Record<string, unknown>
}
