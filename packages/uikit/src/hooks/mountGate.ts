import { type Component, createApp } from 'vue'
import { SHELL_FRAME_KEY, type ShellFrame } from './useShellFrame'

export interface GateHandle {
  dispose(): void
}

// Puts a screen of its own on the page before the app exists — the unlock gate, the boot and crash
// screens. Each is its own Vue app mounted beside #app, so nothing above it provides the frame, and
// without one every uikit role would take the desktop geometry; the caller passes the SAME frame the
// shell will use.
export function mountGate(component: Component, props: Record<string, unknown>, frame: ShellFrame): GateHandle {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(component, props)
  app.provide(SHELL_FRAME_KEY, frame)
  app.mount(host)
  let disposed = false
  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      app.unmount()
      host.remove()
    },
  }
}
