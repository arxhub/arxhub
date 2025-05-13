import { ArxHub } from '@arxhub/core'
import GatewayPlugin from '@arxhub/plugin-gateway/server'
import WebAppPlugin from '@arxhub/plugin-web-app/server'

const hub = new ArxHub()

hub.plugins.register(GatewayPlugin)
hub.plugins.register(WebAppPlugin)

if (import.meta.hot) {
  const prev = import.meta.hot.data.hub
  if (prev != null) {
    prev?.stop()
    console.log('--- VITE NODE HOT UPDATED ---')
  }
  import.meta.hot.data.hub = hub
}

await hub.start(({ plugins, extensions }) => {})
