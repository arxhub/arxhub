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
