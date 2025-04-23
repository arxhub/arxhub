import { ArxHub } from '@arxhub/core'
import GatewayPlugin from '@arxhub/plugin-gateway/server'
import { LocalFileSystem, VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/api'
import VFSPlugin from '@arxhub/plugin-vfs/server'
import WebAppPlugin from '@arxhub/plugin-web-app/server'

const hub = new ArxHub()

hub.use(VFSPlugin, () => [hub.logger])
hub.use(GatewayPlugin, () => [hub.logger])
hub.use(WebAppPlugin, () => [hub.logger])

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
