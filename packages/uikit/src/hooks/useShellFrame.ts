import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

// Which frame the app was built to render. This is decided once, by the instance, and never changes
// while the app is up: desktop and mobile are two separate component trees, not one tree reacting to
// a media query. A surface that differs between them ships two realizations and picks by this value —
// so the difference lives in a file boundary rather than in branches and overrides spread across
// every template.
export type ShellFrame = 'desktop' | 'mobile'

export const SHELL_FRAME_KEY: InjectionKey<ShellFrame> = Symbol('arxhub.shell.frame')

export function provideShellFrame(frame: ShellFrame): void {
  provide(SHELL_FRAME_KEY, frame)
}

// Desktop by default so a component rendered outside a frame — a test harness, a crash screen — still
// has a defined shape to render.
export function useShellFrame(): ShellFrame {
  return inject(SHELL_FRAME_KEY, 'desktop')
}

// The width a phone-shaped viewport stays under. Only an instance that serves both frames from one
// build needs this — see detectShellFrame.
export const MOBILE_BREAKPOINT = 640

// For bundles that cannot know their target at build time: a browser SPA is served to phones and
// desktops alike, so it probes once at boot instead. A build that does know (a Tauri Android bundle,
// a dedicated mobile entry) passes its frame in literally and never calls this.
export function detectShellFrame(): ShellFrame {
  if (typeof window === 'undefined') return 'desktop'
  const narrow = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  // A desktop browser window dragged narrow is still a mouse and a keyboard; a coarse pointer with no
  // hover is what actually asks for touch geometry. Requiring both keeps a narrow devtools viewport
  // on the desktop frame while a real phone gets the mobile one.
  const touch = window.matchMedia('(pointer: coarse) and (hover: none)').matches
  return narrow && touch ? 'mobile' : 'desktop'
}
