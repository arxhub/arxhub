declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

declare module '@arxhub/theme' {}
declare module '@arxhub/theme-preset' {}
