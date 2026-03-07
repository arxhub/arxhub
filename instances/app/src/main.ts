import '@arxhub/theme-preset'
import '@arxhub/theme'
import { ArxHub } from '@arxhub/core'
import { createApp } from 'vue'
import App from './App.vue'

const arxhub = new ArxHub()
await arxhub.start()

createApp(App).mount('#app')
