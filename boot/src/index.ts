import { ArxHub } from '@arxhub/core'
import GatewayPlugin from '@arxhub/plugin-gateway/server'
import VFSPlugin, { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/server'
import WebAppPlugin from '@arxhub/plugin-web-app/server'
import { LocalFileSystem } from '@arxhub/vfs'

const hub = new ArxHub()

hub.plugins.register(VFSPlugin)
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

await hub.start(({ plugins, extensions }) => {
  const vfs = extensions.get(VirtualFileSystemServerExtension)
  vfs.mount('/local', new LocalFileSystem('data'))
})
