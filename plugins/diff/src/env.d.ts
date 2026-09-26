/// <reference types="vite/client" />

// The declaration build (unplugin:dts) follows imported plugins into their .vue files; vue-tsc does not need this.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
