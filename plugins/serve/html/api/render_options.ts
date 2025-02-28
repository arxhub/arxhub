import { RenderMode } from "./render_mode.ts"

export interface RenderOptions {
  mode: RenderMode
  data?: Record<string, unknown>
}
