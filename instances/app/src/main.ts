import '@arxhub/theme-preset'
import '@arxhub/theme'

import { ArxHub } from '@arxhub/core'
import { PanelsPlugin, PanelStoreExtension } from '@arxhub/panels'
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
arxhub.plugins.register(PanelsPlugin)
await arxhub.start()

const { store } = arxhub.extensions.get(PanelStoreExtension)
store.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
store.openPanel('arxhub.welcome')

const app = createApp(App)
app.provide(ARXHUB_KEY, arxhub)
app.mount('#app')
