import '@arxhub/theme-preset'
import '@arxhub/theme'
import { ArxHub } from '@arxhub/core'
import { PanelsPlugin, panelStore } from '@arxhub/panels'
import { createApp } from 'vue'
import App from './App.vue'
import WelcomePanel from './panels/WelcomePanel.vue'

const arxhub = new ArxHub()
arxhub.plugins.register(PanelsPlugin)
await arxhub.start()

panelStore.registerPanel({ id: 'arxhub.welcome', title: 'Welcome', component: WelcomePanel })
panelStore.openPanel('arxhub.welcome')

createApp(App).mount('#app')
