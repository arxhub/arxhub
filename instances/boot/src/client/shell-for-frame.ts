import type { ShellFrame } from '@arxhub/uikit/hooks'
import type { Component } from 'vue'

// The `loadShell` a bundle served to phones and desktops alike hands to `bootClient` — one line per such
// root instead of the same ternary written out in each.
//
// It lives in its own module, and `bootClient` deliberately does NOT fall back to it: a fallback would
// be referenced from every boot, and a referenced `import()` is a chunk whether or not it is ever
// fetched — which is exactly how the Tauri package came to carry the shell it cannot mount. A bundle
// that never names this function never has the branch, and its own folded ternary decides everything.
export function shellForFrame(frame: ShellFrame): Promise<Component> {
  return frame === 'mobile'
    ? import('@arxhub/plugin-shell/ui-mobile').then((it) => it.MobileShell)
    : import('@arxhub/plugin-shell/ui-desktop').then((it) => it.DesktopShell)
}
