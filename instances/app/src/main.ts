import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub } from '@arxhub/core'
import { PanelsPlugin, PanelStoreExtension, PanelsLayout } from '@arxhub/plugin-panels/ui'
import { ShellPlugin, ShellExtension } from '@arxhub/plugin-shell/ui'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { Library } from 'lucide-vue-next'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
arxhub.plugins.register(ShellPlugin)
arxhub.plugins.register(PanelsPlugin)
await arxhub.start()

const shell = arxhub.extensions.get(ShellExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

shell.sidebar.register({
  id: 'library',
  icon: Library,
  title: 'Library',
  layout: PanelsLayout,
})

store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
store.openPanel('arxhub.welcome')

const app = createApp(App)
app.provide(ARXHUB_KEY, arxhub)
app.mount('#app')
