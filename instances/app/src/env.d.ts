/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

declare module '@arxhub/theme'
declare module '@arxhub/theme-preset'
declare module '@arxhub/theme-catppuccin'

// Injected at build time from the instance's package.json (toolchain-vite appVersionDefine).
declare const __APP_VERSION__: string

// Which shell this bundle mounts, decided from the Tauri target platform at build time — see
// vite.config.ts. A literal, so the frame that is not built is dropped from the bundle.
declare const __ARXHUB_FRAME__: 'desktop' | 'mobile'
