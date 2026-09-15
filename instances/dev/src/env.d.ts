/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

declare module '@arxhub/theme'
declare module '@arxhub/theme-preset'
declare module '@arxhub/theme-slate'
declare module '@arxhub/theme-catppuccin'

// Injected at build time from the root package.json — see `define` in this instance's vite.config.ts.
declare const __APP_VERSION__: string
